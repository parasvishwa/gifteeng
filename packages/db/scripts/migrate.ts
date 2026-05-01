/**
 * Data migration from Supabase dumps into the unified Gifteeng Postgres.
 *
 * Prerequisites:
 *   1. pg_dump -Fc both Supabase DBs → b2b.dump, b2c.dump
 *   2. Restore into throwaway schemas on the target DB:
 *        pg_restore -d $DATABASE_URL --no-owner -j 4 b2b.dump
 *        (then rename public → b2b_src)
 *        pg_restore -d $DATABASE_URL --no-owner -j 4 b2c.dump
 *        (then rename public → b2c_src)
 *   3. Ensure Prisma migrations are applied:  pnpm db:migrate
 *
 * Run:  pnpm --filter @gifteeng/db migrate:data
 *
 * Every step is an INSERT … SELECT that runs inside one transaction.
 * On any error the whole thing rolls back and prints which step failed.
 */

import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

type Step = { name: string; sql: string };

const STEPS: Step[] = [
  // ----------------------------------------------------------------
  // 1. Companies (B2B)
  // ----------------------------------------------------------------
  {
    name: "companies",
    sql: `
      INSERT INTO companies (
        id, name, slug, logo_url, brand_color, status,
        billing_email, billing_address, metadata, created_at, updated_at
      )
      SELECT
        c.id,
        c.name,
        c.slug,
        c.logo_url,
        c.primary_color                                                AS brand_color,
        (CASE
          WHEN c.status::text = 'active'     THEN 'active'
          WHEN c.status::text = 'suspended'  THEN 'suspended'
          WHEN c.status::text = 'inactive'   THEN 'suspended'
          WHEN c.status::text = 'onboarding' THEN 'pending'
          ELSE 'pending'
        END)::"CompanyStatus"                                          AS status,
        c.contact_email                                                AS billing_email,
        CASE WHEN c.address IS NOT NULL
             THEN jsonb_build_object('line1', c.address)
             ELSE NULL END                                             AS billing_address,
        jsonb_build_object(
          'legacy_primary_color',   c.primary_color,
          'legacy_secondary_color', c.secondary_color,
          'legacy_domain',          c.domain,
          'legacy_max_employees',   c.max_employees,
          'legacy_wallet_balance',  c.wallet_balance,
          'legacy_contact_phone',   c.contact_phone
        )                                                              AS metadata,
        c.created_at,
        c.updated_at
      FROM b2b_src.companies c
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 2. Company users — profiles + highest-priority user_roles
  // ----------------------------------------------------------------
  {
    name: "company_users",
    sql: `
      INSERT INTO company_users (
        id, company_id, email, phone, full_name, role, is_active,
        metadata, created_at, updated_at
      )
      SELECT
        p.user_id                                                      AS id,
        p.company_id,
        p.email,
        p.phone,
        p.full_name,
        COALESCE(
          (SELECT ur.role::text::"UserRole"
           FROM b2b_src.user_roles ur
           WHERE ur.user_id = p.user_id
           ORDER BY array_position(
             ARRAY['super_admin','sales_admin','hr_admin','production','employee']::text[],
             ur.role::text
           )
           LIMIT 1),
          'employee'::"UserRole"
        )                                                              AS role,
        COALESCE(p.is_active, true)                                    AS is_active,
        jsonb_build_object(
          'legacy_department',    p.department,
          'legacy_designation',   p.designation,
          'legacy_employee_code', p.employee_code,
          'legacy_avatar_url',    p.avatar_url,
          'legacy_profile_id',    p.id
        )                                                              AS metadata,
        p.created_at,
        p.updated_at
      FROM b2b_src.profiles p
      WHERE p.company_id IS NOT NULL
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 3. Customers (B2C)
  // ----------------------------------------------------------------
  {
    name: "customers",
    sql: `
      INSERT INTO customers (
        id, email, phone, full_name, email_verified, phone_verified,
        metadata, created_at, updated_at
      )
      SELECT
        c.id,
        NULLIF(c.email, '')                                            AS email,
        NULLIF(c.phone, '')                                            AS phone,
        NULLIF(c.name,  '')                                            AS full_name,
        COALESCE(c.email_subscribed, false)   /* TODO: verify — legacy has no email_confirmed_at */,
        false                                  /* TODO: verify — legacy has no phone_confirmed_at */,
        jsonb_build_object(
          'legacy_location',     c.location,
          'legacy_orders_count', c.orders_count,
          'legacy_amount_spent', c.amount_spent,
          'legacy_notes',        c.notes
        )                                                              AS metadata,
        c.created_at,
        c.updated_at
      FROM b2c_src.customers c
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 4. Phone OTPs (skip stale)
  // ----------------------------------------------------------------
  {
    name: "phone_otps",
    sql: `
      INSERT INTO phone_otps (id, phone, code_hash, purpose, attempts, expires_at, consumed_at, created_at)
      SELECT
        o.id,
        o.phone,
        COALESCE(o.code_hash, o.code /* TODO: verify column name */),
        COALESCE(o.purpose, 'b2c_login'),
        COALESCE(o.attempts, 0),
        o.expires_at,
        o.consumed_at /* TODO: verify */,
        o.created_at
      FROM b2c_src.phone_otps o
      WHERE o.expires_at > NOW()
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 5. Products — union + dedupe on (lower(title), coalesce(sku,''))
  //
  // Legacy B2C products use TEXT ids, not UUIDs. We coerce to a
  // deterministic UUID via md5() so downstream joins (order_items,
  // wishlist_items) line up. B2B products already have real UUIDs.
  // ----------------------------------------------------------------
  {
    name: "products",
    sql: `
      WITH b2c AS (
        SELECT
          (md5('b2c:' || p.id)::uuid)                                  AS id,
          NULLIF(regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g'), '') AS slug_raw,
          p.name                                                       AS title,
          NULLIF(p.description, '')                                    AS description,
          NULLIF(p.category, '')                                       AS category,
          p.price::numeric(12,2)                                       AS base_price,
          NULL::text                                                   AS sku,
          0                                                            AS inventory,  /* TODO: verify */
          COALESCE(p.customizable, false)                              AS is_customizable,
          CASE WHEN NULLIF(p.image, '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('url', p.image))
               ELSE '[]'::jsonb END                                    AS images,
          true                                                         AS b2c,
          false                                                        AS b2b,
          NULL::uuid                                                   AS owner_company_id,
          p.created_at,
          p.updated_at
        FROM b2c_src.products p
        WHERE COALESCE(p.is_active, true) = true
      ),
      b2b AS (
        SELECT
          p.id,
          NULLIF(regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g'), '') AS slug_raw,
          p.name                                                       AS title,
          NULLIF(p.description, '')                                    AS description,
          p.category::text                                             AS category,
          p.base_price::numeric(12,2)                                  AS base_price,
          p.sku,
          0                                                            AS inventory,  /* TODO: verify — not on legacy products */
          COALESCE(p.customizable, false)                              AS is_customizable,
          CASE WHEN NULLIF(p.image_url, '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('url', p.image_url))
               ELSE '[]'::jsonb END                                    AS images,
          false                                                        AS b2c,
          true                                                         AS b2b,
          NULL::uuid                                                   AS owner_company_id,  /* TODO: verify — B2B products are global via company_products */
          p.created_at,
          p.updated_at
        FROM b2b_src.products p
        WHERE COALESCE(p.is_active, true) = true
      ),
      union_products AS (
        SELECT * FROM b2c
        UNION ALL
        SELECT * FROM b2b
      ),
      keyed AS (
        SELECT
          (lower(title) || '|' || coalesce(sku,''))                    AS dedupe_key,
          *
        FROM union_products
      ),
      -- Collapse channel flags across duplicates (B2C OR B2B → both).
      merged AS (
        SELECT
          dedupe_key,
          (array_agg(id          ORDER BY created_at ASC))[1]          AS id,
          (array_agg(slug_raw    ORDER BY created_at ASC))[1]          AS slug_raw,
          (array_agg(title       ORDER BY created_at ASC))[1]          AS title,
          (array_agg(description ORDER BY created_at ASC))[1]          AS description,
          (array_agg(category    ORDER BY created_at ASC))[1]          AS category,
          MAX(base_price)                                              AS base_price,
          (array_agg(sku         ORDER BY created_at ASC))[1]          AS sku,
          MAX(inventory)                                               AS inventory,
          bool_or(is_customizable)                                     AS is_customizable,
          (array_agg(images      ORDER BY created_at ASC))[1]          AS images,
          bool_or(b2c)                                                 AS b2c_enabled,
          bool_or(b2b)                                                 AS b2b_enabled,
          (array_agg(owner_company_id ORDER BY created_at ASC) FILTER (WHERE owner_company_id IS NOT NULL))[1] AS owner_company_id,
          MIN(created_at)                                              AS created_at,
          MAX(updated_at)                                              AS updated_at
        FROM keyed
        GROUP BY dedupe_key
      ),
      slugged AS (
        SELECT
          m.*,
          COALESCE(m.slug_raw, 'product-' || substring(m.id::text, 1, 8))
            || '-' || substring(m.id::text, 1, 6)                       AS slug
        FROM merged m
      )
      INSERT INTO products (
        id, slug, title, description, category, base_price, sku, inventory,
        is_customizable, images, b2c_enabled, b2b_enabled, owner_company_id,
        created_at, updated_at
      )
      SELECT
        id, slug, title, description, category, base_price, sku, inventory,
        is_customizable, images,
        -- If a B2C-only product survives: b2c_enabled=true, b2b=false, owner=null
        -- If a B2B-only product survives: b2c=false, b2b=true, owner=<company or null>
        -- If both:                        b2c=true, b2b=true, owner=null
        b2c_enabled,
        b2b_enabled,
        CASE WHEN b2c_enabled AND b2b_enabled THEN NULL ELSE owner_company_id END,
        created_at, updated_at
      FROM slugged
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 6. Product variant options
  //
  // B2C stores variants as arrays (sizes[], colors[]) on the product row.
  // B2B same shape. We explode them into normalized rows. Also pull from
  // b2c_src.product_variant_options if present.
  // ----------------------------------------------------------------
  {
    name: "product_variant_options",
    sql: `
      -- 6a: exploded from B2C sizes[]/colors[]
      INSERT INTO product_variant_options (id, product_id, name, value, price_delta, sku, inventory, image)
      SELECT
        gen_random_uuid(),
        (md5('b2c:' || p.id)::uuid),
        'size',
        s,
        0,
        NULL,
        0,
        NULL
      FROM b2c_src.products p,
           unnest(COALESCE(p.sizes, ARRAY[]::text[])) s
      WHERE s IS NOT NULL AND s <> ''
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: "product_variant_options_colors_b2c",
    sql: `
      INSERT INTO product_variant_options (id, product_id, name, value, price_delta, sku, inventory, image)
      SELECT
        gen_random_uuid(),
        (md5('b2c:' || p.id)::uuid),
        'color',
        c,
        0,
        NULL,
        0,
        NULL
      FROM b2c_src.products p,
           unnest(COALESCE(p.colors, ARRAY[]::text[])) c
      WHERE c IS NOT NULL AND c <> ''
      ON CONFLICT DO NOTHING;
    `,
  },
  {
    name: "product_variant_options_b2b",
    sql: `
      INSERT INTO product_variant_options (id, product_id, name, value, price_delta, sku, inventory, image)
      SELECT
        gen_random_uuid(),
        p.id,
        'size',
        s,
        0,
        NULL,
        0,
        NULL
      FROM b2b_src.products p,
           unnest(COALESCE(p.sizes, ARRAY[]::text[])) s
      WHERE s IS NOT NULL AND s <> ''
        AND EXISTS (SELECT 1 FROM products np WHERE np.id = p.id)
      ON CONFLICT DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 7. Company products
  // ----------------------------------------------------------------
  {
    name: "company_products",
    sql: `
      INSERT INTO company_products (id, company_id, product_id, override_price, is_visible, created_at)
      SELECT
        cp.id,
        cp.company_id,
        cp.product_id,
        cp.company_price::numeric(12,2)                                AS override_price,
        COALESCE(cp.is_enabled, true)                                  AS is_visible,
        cp.created_at
      FROM b2b_src.company_products cp
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = cp.product_id)
        AND EXISTS (SELECT 1 FROM companies co WHERE co.id = cp.company_id)
      ON CONFLICT (company_id, product_id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 8. Price slabs
  // ----------------------------------------------------------------
  {
    name: "price_slabs",
    sql: `
      INSERT INTO price_slabs (id, product_id, company_id, min_qty, max_qty, unit_price)
      SELECT
        ps.id,
        ps.product_id,
        ps.company_id,
        ps.min_qty,
        ps.max_qty,
        ps.price::numeric(12,2)                                        AS unit_price
      FROM b2b_src.price_slabs ps
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = ps.product_id)
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 9. Collections (B2C)
  // ----------------------------------------------------------------
  {
    name: "collections",
    sql: `
      INSERT INTO collections (id, slug, title, description, hero_image, is_published, sort_order, created_at)
      SELECT
        c.id,
        COALESCE(c.slug, regexp_replace(lower(c.title /* TODO: verify column */), '[^a-z0-9]+', '-', 'g')),
        c.title /* TODO: verify — legacy may use 'name' */,
        c.description /* TODO: verify */,
        c.hero_image /* TODO: verify */,
        COALESCE(c.is_published, true) /* TODO: verify */,
        COALESCE(c.sort_order, 0)      /* TODO: verify */,
        c.created_at
      FROM b2c_src.collections c
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 10. Product ↔ collection links (note product_id coercion for B2C)
  // ----------------------------------------------------------------
  {
    name: "product_collections",
    sql: `
      INSERT INTO product_collections (product_id, collection_id, sort_order)
      SELECT
        (md5('b2c:' || pc.product_id)::uuid)                           AS product_id,
        pc.collection_id,
        COALESCE(pc.sort_order, 0) /* TODO: verify */
      FROM b2c_src.product_collections pc
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = (md5('b2c:' || pc.product_id)::uuid))
        AND EXISTS (SELECT 1 FROM collections c WHERE c.id = pc.collection_id)
      ON CONFLICT (product_id, collection_id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 11. Catalogs
  // ----------------------------------------------------------------
  {
    name: "catalogs",
    sql: `
      INSERT INTO catalogs (id, slug, title, description, hero_image, is_published, created_at)
      SELECT
        c.id,
        COALESCE(c.slug, regexp_replace(lower(c.title /* TODO: verify */), '[^a-z0-9]+', '-', 'g')),
        c.title /* TODO: verify */,
        c.description /* TODO: verify */,
        c.hero_image  /* TODO: verify */,
        COALESCE(c.is_published, true) /* TODO: verify */,
        c.created_at
      FROM b2c_src.catalogs c
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 12. Catalog items
  // ----------------------------------------------------------------
  {
    name: "catalog_items",
    sql: `
      INSERT INTO catalog_items (id, catalog_id, product_id, sort_order)
      SELECT
        ci.id,
        ci.catalog_id,
        (md5('b2c:' || ci.product_id)::uuid)                           AS product_id,
        COALESCE(ci.sort_order, 0) /* TODO: verify */
      FROM b2c_src.catalog_items ci
      WHERE EXISTS (SELECT 1 FROM catalogs c WHERE c.id = ci.catalog_id)
        AND EXISTS (SELECT 1 FROM products p WHERE p.id = (md5('b2c:' || ci.product_id)::uuid))
      ON CONFLICT (catalog_id, product_id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 13. Catalog enquiries
  // ----------------------------------------------------------------
  {
    name: "catalog_enquiries",
    sql: `
      INSERT INTO catalog_enquiries (
        id, catalog_id, contact_name, contact_email, contact_phone,
        company_name, message, requested_items, status, created_at
      )
      SELECT
        e.id,
        e.catalog_id,
        COALESCE(e.contact_name, e.name /* TODO: verify */, 'Unknown'),
        COALESCE(e.contact_email, e.email /* TODO: verify */, ''),
        e.contact_phone /* TODO: verify */,
        e.company_name  /* TODO: verify */,
        e.message       /* TODO: verify */,
        NULL::jsonb     /* TODO: verify — legacy enquiry items live in catalog_enquiry_items */,
        COALESCE(e.status, 'new') /* TODO: verify */,
        e.created_at
      FROM b2c_src.catalog_enquiries e
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 14. Saved addresses
  // ----------------------------------------------------------------
  {
    name: "saved_addresses",
    sql: `
      INSERT INTO saved_addresses (
        id, customer_id, label, full_name, phone, line1, line2,
        city, state, pincode, country, is_default, created_at
      )
      SELECT
        sa.id,
        sa.customer_id /* TODO: verify — may be user_id */,
        sa.label       /* TODO: verify */,
        COALESCE(sa.full_name, sa.name /* TODO: verify */, ''),
        COALESCE(sa.phone, ''),
        COALESCE(sa.line1, sa.address /* TODO: verify */, ''),
        sa.line2       /* TODO: verify */,
        COALESCE(sa.city, ''),
        COALESCE(sa.state, ''),
        COALESCE(sa.pincode, ''),
        COALESCE(sa.country, 'IN'),
        COALESCE(sa.is_default, false),
        sa.created_at
      FROM b2c_src.saved_addresses sa
      WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = sa.customer_id /* TODO: verify column */)
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 15a. Wishlists
  // ----------------------------------------------------------------
  {
    name: "wishlists",
    sql: `
      INSERT INTO wishlists (id, customer_id, name, created_at)
      SELECT
        w.id,
        w.customer_id /* TODO: verify — may be user_id */,
        COALESCE(w.name, 'Default'),
        w.created_at
      FROM b2c_src.wishlists w
      WHERE EXISTS (SELECT 1 FROM customers c WHERE c.id = w.customer_id /* TODO: verify */)
      ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "wishlist_items",
    sql: `
      INSERT INTO wishlist_items (wishlist_id, product_id, added_at)
      SELECT
        wi.wishlist_id /* TODO: verify — legacy wishlists table may embed product_ids inline */,
        (md5('b2c:' || wi.product_id)::uuid),
        COALESCE(wi.added_at, wi.created_at, now())
      FROM b2c_src.wishlist_items wi /* TODO: verify table name */
      WHERE EXISTS (SELECT 1 FROM wishlists w  WHERE w.id = wi.wishlist_id)
        AND EXISTS (SELECT 1 FROM products p  WHERE p.id = (md5('b2c:' || wi.product_id)::uuid))
      ON CONFLICT (wishlist_id, product_id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 16. Carts (last 30 days only)
  // ----------------------------------------------------------------
  {
    name: "carts",
    sql: `
      INSERT INTO carts (id, customer_id, session_key, updated_at, created_at)
      SELECT
        c.id,
        c.customer_id /* TODO: verify */,
        c.session_key /* TODO: verify */,
        c.updated_at,
        c.created_at
      FROM b2c_src.carts c /* TODO: verify table exists; legacy may use 'carts' or 'shopping_carts' */
      WHERE c.updated_at > NOW() - INTERVAL '30 days'
      ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "cart_items",
    sql: `
      INSERT INTO cart_items (id, cart_id, product_id, qty, variant_options, customization, added_at)
      SELECT
        ci.id,
        ci.cart_id,
        (md5('b2c:' || ci.product_id::text)::uuid),
        COALESCE(ci.qty, ci.quantity /* TODO: verify */, 1),
        ci.variant_options /* TODO: verify */,
        ci.customization   /* TODO: verify */,
        COALESCE(ci.added_at, ci.created_at, now())
      FROM b2c_src.cart_items ci /* TODO: verify */
      WHERE EXISTS (SELECT 1 FROM carts ca WHERE ca.id = ci.cart_id)
        AND EXISTS (SELECT 1 FROM products p WHERE p.id = (md5('b2c:' || ci.product_id::text)::uuid))
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 17. Discounts
  // ----------------------------------------------------------------
  {
    name: "discounts",
    sql: `
      INSERT INTO discounts (
        id, code, description, percent, amount, min_order_total,
        usage_limit, used_count, starts_at, ends_at, is_active, created_at
      )
      SELECT
        d.id,
        d.code,
        d.description                                                  /* TODO: verify */,
        d.percent::numeric(5,2)                                        /* TODO: verify */,
        d.amount::numeric(12,2)                                        /* TODO: verify */,
        d.min_order_total::numeric(12,2)                               /* TODO: verify */,
        d.usage_limit                                                  /* TODO: verify */,
        COALESCE(d.used_count, 0)                                      /* TODO: verify */,
        d.starts_at                                                    /* TODO: verify */,
        d.ends_at                                                      /* TODO: verify */,
        COALESCE(d.is_active, true),
        d.created_at
      FROM b2c_src.discounts d
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 18. Orders — UNION B2C ('b2c' channel) and B2B ('b2b')
  //
  // Legacy B2C uses TEXT statuses; we map via CASE. Legacy B2B uses an
  // enum with many in_print / ready_to_pack style values; we collapse
  // those to the closest new enum member.
  // ----------------------------------------------------------------
  {
    name: "orders",
    sql: `
      WITH b2c AS (
        SELECT
          o.id,
          'LEGACY-' || substring(o.id::text, 1, 8)                     AS order_number,
          'b2c'::"Channel"                                             AS channel,
          (CASE lower(COALESCE(o.status,''))
            WHEN 'pending'         THEN 'new_order'
            WHEN 'confirmed'       THEN 'confirmed'
            WHEN 'processing'      THEN 'in_production'
            WHEN 'in_production'   THEN 'in_production'
            WHEN 'in_print'        THEN 'in_production'
            WHEN 'ready_to_pack'   THEN 'ready_to_ship'
            WHEN 'packed'          THEN 'ready_to_ship'
            WHEN 'ready_to_ship'   THEN 'ready_to_ship'
            WHEN 'shipped'         THEN 'shipped'
            WHEN 'out_for_delivery' THEN 'shipped'
            WHEN 'delivered'       THEN 'delivered'
            WHEN 'cancelled'       THEN 'cancelled'
            WHEN 'canceled'        THEN 'cancelled'
            WHEN 'returned'        THEN 'returned'
            WHEN 'return_requested' THEN 'returned'
            ELSE 'new_order'
          END)::"OrderStatus"                                          AS status,
          'normal'::"OrderPriority"                                    AS priority,
          NULL::uuid                                                    AS customer_id,  /* TODO: verify — link via email/phone if present */
          NULL::uuid                                                    AS company_id,
          NULL::uuid                                                    AS company_user_id,
          o.subtotal::numeric(12,2)                                     AS subtotal,
          0::numeric(12,2)                                              AS discount_total,
          o.delivery_charge::numeric(12,2)                              AS shipping_total,
          0::numeric(12,2)                                              AS tax_total,
          (o.total)::numeric(14,2)                                      AS grand_total,
          (CASE lower(COALESCE(o.payment_method,''))
            WHEN 'razorpay' THEN 'razorpay'
            WHEN 'cod'      THEN 'cod'
            WHEN 'wallet'   THEN 'wallet'
            ELSE 'razorpay'
          END)::"PaymentMethod"                                        AS payment_method,
          (CASE lower(COALESCE(o.payment_status,''))
            WHEN 'pending'    THEN 'pending'
            WHEN 'authorized' THEN 'authorized'
            WHEN 'captured'   THEN 'captured'
            WHEN 'paid'       THEN 'captured'
            WHEN 'failed'     THEN 'failed'
            WHEN 'refunded'   THEN 'refunded'
            ELSE 'pending'
          END)::"PaymentStatus"                                        AS payment_status,
          jsonb_build_object(
            'name',    o.customer_name,
            'phone',   o.customer_phone,
            'email',   o.customer_email,
            'line1',   o.shipping_address,
            'city',    o.shipping_city,
            'state',   o.shipping_state,
            'pincode', o.shipping_pincode
          )                                                            AS shipping_address,
          NULL::jsonb                                                  AS billing_address,
          o.notes,
          jsonb_build_object(
            'legacy_order_number', o.order_number,
            'legacy_cod_charge',   o.cod_charge
          )                                                            AS metadata,
          o.created_at                                                 AS placed_at,
          o.updated_at                                                 AS updated_at
        FROM b2c_src.orders o
      ),
      b2b AS (
        SELECT
          o.id,
          'LEGACY-' || substring(o.id::text, 1, 8)                     AS order_number,
          'b2b'::"Channel"                                             AS channel,
          (CASE o.status::text
            WHEN 'new_order'         THEN 'new_order'
            WHEN 'confirmed'         THEN 'confirmed'
            WHEN 'in_print'          THEN 'in_production'
            WHEN 'ready_to_pack'     THEN 'in_production'
            WHEN 'packed'            THEN 'ready_to_ship'
            WHEN 'shipped'           THEN 'shipped'
            WHEN 'out_for_delivery'  THEN 'shipped'
            WHEN 'delivered'         THEN 'delivered'
            WHEN 'cancelled'         THEN 'cancelled'
            WHEN 'return_requested'  THEN 'returned'
            WHEN 'return_approved'   THEN 'returned'
            WHEN 'return_picked'     THEN 'returned'
            WHEN 'refund_initiated'  THEN 'returned'
            WHEN 'refund_completed'  THEN 'returned'
            ELSE 'new_order'
          END)::"OrderStatus"                                          AS status,
          (CASE o.priority::text
            WHEN 'normal'   THEN 'normal'
            WHEN 'urgent'   THEN 'urgent'
            WHEN 'campaign' THEN 'high'
            WHEN 'bulk'     THEN 'high'
            ELSE 'normal'
          END)::"OrderPriority"                                        AS priority,
          NULL::uuid                                                    AS customer_id,
          o.company_id,
          o.user_id                                                     AS company_user_id,
          o.subtotal::numeric(12,2),
          0::numeric(12,2)                                              AS discount_total,
          0::numeric(12,2)                                              AS shipping_total,
          0::numeric(12,2)                                              AS tax_total,
          o.total::numeric(14,2)                                        AS grand_total,
          'wallet'::"PaymentMethod"                                    AS payment_method,
          'captured'::"PaymentStatus"                                  AS payment_status, /* TODO: verify */
          jsonb_build_object(
            'name',    o.shipping_name,
            'phone',   o.shipping_phone,
            'line1',   o.shipping_address,
            'city',    o.shipping_city,
            'state',   o.shipping_state,
            'pincode', o.shipping_pincode
          )                                                            AS shipping_address,
          NULL::jsonb                                                  AS billing_address,
          o.notes,
          jsonb_build_object(
            'legacy_order_number',  o.order_number,
            'legacy_wallet_amount', o.wallet_amount,
            'legacy_paid_amount',   o.paid_amount,
            'legacy_tracking',      o.tracking_number,
            'legacy_courier',       o.courier_name,
            'legacy_campaign_id',   o.campaign_id
          )                                                            AS metadata,
          o.created_at                                                 AS placed_at,
          o.updated_at                                                 AS updated_at
        FROM b2b_src.orders o
      )
      INSERT INTO orders (
        id, order_number, channel, status, priority,
        customer_id, company_id, company_user_id,
        subtotal, discount_total, shipping_total, tax_total, grand_total,
        payment_method, payment_status,
        shipping_address, billing_address, notes, metadata,
        placed_at, updated_at
      )
      SELECT * FROM b2c
      UNION ALL
      SELECT * FROM b2b
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 19. Order items (B2C + B2B)
  // ----------------------------------------------------------------
  {
    name: "order_items",
    sql: `
      -- 19a: B2C
      INSERT INTO order_items (
        id, order_id, product_id, qty, unit_price, total_price,
        variant_options, customization, snapshot
      )
      SELECT
        oi.id,
        oi.order_id,
        (md5('b2c:' || oi.product_id)::uuid)                           AS product_id,
        oi.quantity                                                    AS qty,
        oi.unit_price::numeric(12,2),
        oi.total_price::numeric(12,2),
        jsonb_build_object(
          'size',     NULLIF(oi.selected_size, ''),
          'color',    NULLIF(oi.selected_color, ''),
          'material', NULLIF(oi.selected_material, ''),
          'finish',   NULLIF(oi.selected_finish, ''),
          'printing', NULLIF(oi.selected_printing, '')
        )                                                              AS variant_options,
        jsonb_build_object(
          'custom_text',       oi.custom_text,
          'custom_font',       oi.custom_font,
          'custom_color_code', oi.custom_color_code,
          'custom_photo_url',  oi.custom_photo_url,
          'preview_image_url', oi.preview_image_url,
          'fonts_used',        oi.fonts_used,
          'images_used',       oi.images_used
        )                                                              AS customization,
        jsonb_build_object(
          'product_name',  oi.product_name,
          'product_image', oi.product_image
        )                                                              AS snapshot
      FROM b2c_src.order_items oi
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id)
        AND EXISTS (SELECT 1 FROM products p WHERE p.id = (md5('b2c:' || oi.product_id)::uuid))
      ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "order_items_b2b",
    sql: `
      INSERT INTO order_items (
        id, order_id, product_id, qty, unit_price, total_price,
        variant_options, customization, snapshot
      )
      SELECT
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity                                                    AS qty,
        oi.unit_price::numeric(12,2),
        oi.total_price::numeric(12,2),
        jsonb_build_object(
          'size',  NULLIF(oi.size, ''),
          'color', NULLIF(oi.color, '')
        )                                                              AS variant_options,
        COALESCE(oi.customization_data, '{}'::jsonb)                   AS customization,
        jsonb_build_object(
          'product_name',   oi.product_name,
          'print_file_url', oi.print_file_url,
          'mockup_url',     oi.mockup_url
        )                                                              AS snapshot
      FROM b2b_src.order_items oi
      WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = oi.order_id)
        AND oi.product_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM products p WHERE p.id = oi.product_id)
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 20. Shipments (optional — only if legacy shipments table exists).
  //     Wrapped in a DO block so a missing table doesn't fail the txn.
  // ----------------------------------------------------------------
  {
    name: "shipments",
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'b2c_src' AND table_name = 'shipments'
        ) THEN
          INSERT INTO shipments (
            id, order_id, provider, awb, courier, tracking_url,
            status, shipped_at, delivered_at, provider_payload, created_at, updated_at
          )
          SELECT
            s.id, s.order_id,
            COALESCE(s.provider, 'shiprocket'),
            s.awb, s.courier, s.tracking_url, s.status,
            s.shipped_at, s.delivered_at, s.provider_payload,
            s.created_at, s.updated_at
          FROM b2c_src.shipments s
          WHERE EXISTS (SELECT 1 FROM orders o WHERE o.id = s.order_id)
          ON CONFLICT (id) DO NOTHING;
        END IF;
      END $$;
    `,
  },

  // ----------------------------------------------------------------
  // 21. Wallets
  // ----------------------------------------------------------------
  {
    name: "wallets",
    sql: `
      INSERT INTO wallets (
        id, owner_type, company_id, company_user_id,
        balance, locked_balance, currency, created_at, updated_at
      )
      SELECT
        w.id,
        (CASE WHEN COALESCE(w.is_company_wallet, false)
              THEN 'company' ELSE 'employee' END)::"WalletOwnerType",
        CASE WHEN COALESCE(w.is_company_wallet, false) THEN w.company_id ELSE NULL END,
        CASE WHEN COALESCE(w.is_company_wallet, false) THEN NULL ELSE w.user_id END,
        w.balance::numeric(14,2),
        COALESCE(w.locked_balance, 0)::numeric(14,2),
        'INR',
        w.created_at,
        w.updated_at
      FROM b2b_src.wallets w
      WHERE (
        (COALESCE(w.is_company_wallet, false) = true  AND EXISTS (SELECT 1 FROM companies c     WHERE c.id = w.company_id)) OR
        (COALESCE(w.is_company_wallet, false) = false AND EXISTS (SELECT 1 FROM company_users u WHERE u.id = w.user_id))
      )
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 22. Wallet transactions — map legacy txn_type enum
  // ----------------------------------------------------------------
  {
    name: "wallet_transactions",
    sql: `
      INSERT INTO wallet_transactions (id, wallet_id, type, amount, reference, notes, created_at)
      SELECT
        wt.id,
        wt.wallet_id,
        (CASE wt.txn_type::text
          WHEN 'credit_company_topup' THEN 'topup'
          WHEN 'credit_refund'        THEN 'refund'
          WHEN 'credit_campaign'      THEN 'topup'
          WHEN 'debit_purchase'       THEN 'debit'
          WHEN 'debit_expiry'         THEN 'debit'
          WHEN 'debit_adjustment'     THEN 'debit'
          WHEN 'transfer_to_employee' THEN 'debit'
          WHEN 'transfer_from_company' THEN 'topup'
          ELSE 'debit'
        END)::"WalletTxnType"                                          AS type,
        wt.amount::numeric(14,2),
        wt.reference_id::text                                          AS reference,
        wt.description                                                 AS notes,
        wt.created_at
      FROM b2b_src.wallet_transactions wt
      WHERE EXISTS (SELECT 1 FROM wallets w WHERE w.id = wt.wallet_id)
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 23. Campaigns
  // ----------------------------------------------------------------
  {
    name: "campaigns",
    sql: `
      INSERT INTO campaigns (
        id, company_id, type, status, title, description,
        budget_total, per_employee_amount, starts_at, ends_at,
        metadata, created_at, updated_at
      )
      SELECT
        c.id,
        c.company_id,
        COALESCE(c.type::text, 'custom')::"CampaignType"               /* TODO: verify */,
        COALESCE(c.status::text, 'draft')::"CampaignStatus"            /* TODO: verify */,
        c.title                                                        /* TODO: verify — may be 'name' */,
        c.description,
        COALESCE(c.budget_total, 0)::numeric(14,2)                     /* TODO: verify */,
        c.per_employee_amount::numeric(12,2)                           /* TODO: verify */,
        c.starts_at                                                    /* TODO: verify */,
        c.ends_at                                                      /* TODO: verify */,
        NULL::jsonb                                                    AS metadata,
        c.created_at,
        c.updated_at
      FROM b2b_src.campaigns c
      WHERE EXISTS (SELECT 1 FROM companies co WHERE co.id = c.company_id)
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 24. Campaign allocations
  // ----------------------------------------------------------------
  {
    name: "campaign_allocations",
    sql: `
      INSERT INTO campaign_allocations (
        id, campaign_id, company_user_id, amount, redeemed_amount,
        status, expires_at, created_at, updated_at
      )
      SELECT
        ca.id,
        ca.campaign_id,
        ca.user_id                                                     AS company_user_id, /* TODO: verify */
        ca.amount::numeric(12,2),
        COALESCE(ca.redeemed_amount, 0)::numeric(12,2)                 /* TODO: verify */,
        COALESCE(ca.status::text, 'pending')::"AllocationStatus"       /* TODO: verify */,
        ca.expires_at                                                  /* TODO: verify */,
        ca.created_at,
        COALESCE(ca.updated_at, ca.created_at)
      FROM b2b_src.campaign_allocations ca
      WHERE EXISTS (SELECT 1 FROM campaigns cm WHERE cm.id = ca.campaign_id)
        AND EXISTS (SELECT 1 FROM company_users u WHERE u.id = ca.user_id /* TODO: verify */)
      ON CONFLICT (campaign_id, company_user_id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 25a. Reviews
  // ----------------------------------------------------------------
  {
    name: "reviews",
    sql: `
      INSERT INTO reviews (id, product_id, customer_id, rating, title, body, is_approved, created_at)
      SELECT
        r.id,
        (md5('b2c:' || r.product_id::text)::uuid)                      AS product_id,
        r.customer_id                                                  /* TODO: verify */,
        r.rating,
        r.title                                                        /* TODO: verify */,
        COALESCE(r.body, r.comment /* TODO: verify */, ''),
        COALESCE(r.is_approved, true)                                  /* TODO: verify */,
        r.created_at
      FROM b2c_src.reviews r
      WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = (md5('b2c:' || r.product_id::text)::uuid))
      ON CONFLICT (id) DO NOTHING;
    `,
  },
  {
    name: "customer_photos",
    sql: `
      INSERT INTO customer_photos (id, review_id, customer_id, url, caption, created_at)
      SELECT
        cp.id,
        cp.review_id                                                   /* TODO: verify */,
        cp.customer_id                                                 /* TODO: verify */,
        cp.url,
        cp.caption                                                     /* TODO: verify */,
        cp.created_at
      FROM b2c_src.customer_photos cp
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 26. Design templates
  // ----------------------------------------------------------------
  {
    name: "design_templates",
    sql: `
      INSERT INTO design_templates (id, name, canvas_json, preview_url, category, created_at)
      SELECT
        d.id,
        d.name,
        COALESCE(d.canvas_json, d.template_json /* TODO: verify */, '{}'::jsonb),
        d.preview_url                                                  /* TODO: verify */,
        d.category                                                     /* TODO: verify */,
        d.created_at
      FROM b2c_src.design_templates d
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 27. Thank you cards
  // ----------------------------------------------------------------
  {
    name: "thank_you_cards",
    sql: `
      INSERT INTO thank_you_cards (id, name, canvas_json, preview_url, created_at)
      SELECT
        t.id,
        t.name,
        COALESCE(t.canvas_json, t.template_json /* TODO: verify */, '{}'::jsonb),
        t.preview_url                                                  /* TODO: verify */,
        t.created_at
      FROM b2c_src.thank_you_cards t
      ON CONFLICT (id) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 28. Site settings (B2C only — B2B keys would collide)
  // ----------------------------------------------------------------
  {
    name: "site_settings",
    sql: `
      INSERT INTO site_settings (key, value, updated_at)
      SELECT
        s.key,
        s.value,
        COALESCE(s.updated_at, now())
      FROM b2c_src.site_settings s
      ON CONFLICT (key) DO NOTHING;
    `,
  },

  // ----------------------------------------------------------------
  // 29. Files — deferred. Requires rclone/rsync of storage buckets
  //     (order-assets, product-images, design-assets) before we can
  //     register paths in the `files` table.
  // ----------------------------------------------------------------
  // TODO(files): after rclone sync, walk the uploads dir and insert
  //              one row per asset with the correct owner_type / owner_id.
];

async function main() {
  const pg = new Client({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log("Connected");

  const report: Record<string, number> = {};
  let failedStep: string | null = null;

  try {
    await pg.query("BEGIN");

    for (const step of STEPS) {
      const before = Date.now();
      try {
        const res = await pg.query(step.sql);
        const ms = Date.now() - before;
        report[step.name] = res.rowCount ?? 0;
        console.log(`  ok ${step.name}: ${res.rowCount ?? 0} rows in ${ms}ms`);
      } catch (stepErr) {
        failedStep = step.name;
        throw stepErr;
      }
    }

    await pg.query("COMMIT");
    console.log("\n=== MIGRATION COMPLETE ===");
    console.log(JSON.stringify(report, null, 2));

    // Row count parity
    console.log("\n=== ROW COUNT PARITY ===");
    const parityTables = [
      "companies",
      "company_users",
      "customers",
      "products",
      "product_variant_options",
      "company_products",
      "price_slabs",
      "collections",
      "catalogs",
      "catalog_items",
      "saved_addresses",
      "wishlists",
      "carts",
      "orders",
      "order_items",
      "wallets",
      "wallet_transactions",
      "campaigns",
      "campaign_allocations",
      "reviews",
      "customer_photos",
      "design_templates",
      "thank_you_cards",
      "site_settings",
    ];
    for (const table of parityTables) {
      const r = await pg.query(`SELECT COUNT(*)::int AS count FROM ${table};`);
      console.log(`  ${table.padEnd(28)} ${r.rows[0].count}`);
    }
  } catch (err) {
    await pg.query("ROLLBACK");
    console.error(
      `\nMIGRATION FAILED at step '${failedStep ?? "unknown"}':`,
      (err as Error).message,
    );
    console.error("Rolled back. Partial report:");
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  } finally {
    await pg.end();
  }
}

main();
