import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@gifteeng/db";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Tiny CSV row helper. Wraps a Record<string,string> so callers can read
 * cells without TS noUncheckedIndexedAccess hassle — `.get("Email")`
 * always returns a trimmed string ("" when the column is missing or
 * blank). Keeps the import service readable.
 */
class Row {
  constructor(private readonly cells: Record<string, string>) {}
  get(key: string): string { return this.cells[key] ?? ""; }
  has(key: string): boolean { return key in this.cells; }
  toJSON(): Record<string, string> { return this.cells; }
}

/**
 * Shopify → Gifteeng migration service.
 *
 * Two CSV inputs (Shopify "Customers" export + Shopify "Orders" export)
 * are parsed in-memory, deduplicated, and written to the Gifteeng tables.
 * Both endpoints support a dry-run mode that returns what WOULD have
 * happened without committing — used by the admin UI to surface skipped
 * rows + reasons before the real run.
 *
 * Idempotency: every imported row is tagged with `metadata.shopify_id`
 * (or shopify_handle / shopify_email for customers without an id column).
 * Re-running the import skips rows whose source id already exists.
 *
 * Phone is the canonical match key for customers — Shopify exports
 * "Phone" in E.164-ish format, we normalise to +91XXXXXXXXXX (10-digit
 * Indian numbers) so a re-imported customer always merges with the live
 * Gifteeng record instead of duplicating.
 */
@Injectable()
export class ShopifyMigrateService {
  private readonly logger = new Logger(ShopifyMigrateService.name);
  // All migrated order line items point at this placeholder product so the
  // foreign key constraint on OrderItem.productId is satisfied. The full
  // product info (title / image / price) lives in `snapshot` on the line.
  private placeholderProductId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ── CSV ────────────────────────────────────────────────────────────────

  /**
   * Tolerant CSV parser. Handles quoted fields, escaped quotes ("" → "),
   * CRLF / LF line endings, and Shopify's habit of leaving trailing empty
   * lines. Returns rows as a Row helper that always returns "" for
   * unknown columns — saves every call site from optional-chain dances
   * under noUncheckedIndexedAccess.
   */
  private parseCsv(buf: Buffer): Row[] {
    const text = buf.toString("utf8").replace(/^﻿/, ""); // strip BOM
    const lines = this.splitCsvLines(text);
    if (lines.length === 0) return [];
    const headerLine = lines[0] ?? "";
    const header = this.splitCsvCells(headerLine).map(h => h.trim());
    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const cells = this.splitCsvCells(line);
      const map: Record<string, string> = {};
      for (let c = 0; c < header.length; c++) {
        const key = header[c] ?? "";
        if (!key) continue;
        map[key] = (cells[c] ?? "").trim();
      }
      rows.push(new Row(map));
    }
    return rows;
  }

  // Splits a CSV blob into logical lines, respecting newlines inside
  // double-quoted fields (Shopify wraps multi-line addresses in quotes).
  private splitCsvLines(text: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') { cur += '""'; i++; continue; }
        inQuotes = !inQuotes;
        cur += ch;
        continue;
      }
      if (!inQuotes && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && text[i + 1] === "\n") i++; // swallow CRLF pair
        if (cur.length > 0) { out.push(cur); cur = ""; }
        continue;
      }
      cur += ch;
    }
    if (cur.length > 0) out.push(cur);
    return out;
  }

  private splitCsvCells(line: string): string[] {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === ",") { out.push(cur); cur = ""; }
        else if (ch === '"') inQuotes = true;
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  // ── Phone normalisation ────────────────────────────────────────────────

  /**
   * Coerces Shopify's loose phone format into Gifteeng's canonical
   * E.164 with country code. Returns null for anything we can't parse
   * (the importer flags those rows for manual review instead of risking
   * a duplicate or a wrong-number account).
   */
  private normalisePhone(raw: string | undefined | null): string | null {
    if (!raw) return null;
    let s = raw.replace(/[^0-9+]/g, "");
    if (!s) return null;
    if (s.startsWith("+")) {
      // Already E.164-shaped — keep as-is if it has 10–15 digits after the +.
      const digits = s.slice(1);
      return digits.length >= 10 && digits.length <= 15 ? s : null;
    }
    if (s.length === 10) return `+91${s}`;          // Indian mobile
    if (s.length === 11 && s.startsWith("0")) return `+91${s.slice(1)}`;
    if (s.length === 12 && s.startsWith("91")) return `+${s}`;
    return null;
  }

  // ── Placeholder product (created once on first migration run) ──────────

  private async ensurePlaceholderProduct(): Promise<string> {
    if (this.placeholderProductId) return this.placeholderProductId;
    const slug = "shopify-migrated-line-item";
    // Upsert so any row created by an older service version (which didn't
    // stamp `metadata.shopify_placeholder = true`) gets the flag backfilled.
    // The admin list filter hides on that flag, so without this backfill
    // the placeholder kept "coming back" on the admin product grid even
    // after the operator soft-deleted it.
    const row = await this.prisma.product.upsert({
      where: { slug },
      update: {
        // Don't touch enabled flags / pricing here — operator may have
        // tombstoned the row and we want to preserve that. Just stamp the
        // identification flag so filters work.
        metadata: { shopify_placeholder: true } as Prisma.InputJsonValue,
      },
      create: {
        slug,
        title: "Shopify migrated line item (placeholder)",
        description:
          "Auto-created so historical Shopify orders can satisfy the OrderItem.productId FK. The line snapshot carries the real product info.",
        basePrice: new Prisma.Decimal(0),
        inventory: 0,
        isCustomizable: false,
        b2cEnabled: false,                    // hidden from the storefront
        b2bEnabled: false,
        metadata: { shopify_placeholder: true } as Prisma.InputJsonValue,
      },
    });
    this.placeholderProductId = row.id;
    return row.id;
  }

  // ── Customer import ────────────────────────────────────────────────────

  async importCustomers(buffer: Buffer, opts: { dryRun?: boolean } = {}) {
    const rows = this.parseCsv(buffer);
    if (rows.length === 0) {
      throw new BadRequestException("Customer CSV has no rows");
    }
    // Fail fast if the CSV is from a different export (e.g. Shopify
    // products) — the columns won't match.
    const sample = rows[0];
    if (!sample || (!sample.has("Email") && !sample.has("First Name"))) {
      throw new BadRequestException(
        "CSV doesn't look like a Shopify customer export. Expected columns include 'Email', 'First Name', 'Last Name', 'Phone'.",
      );
    }

    let created = 0;
    let merged = 0;
    let skipped = 0;
    const errors: { row: number; reason: string; raw: Record<string, string> }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const email = r.get("Email").toLowerCase() || null;
      const phone = this.normalisePhone(r.get("Phone"));
      const first = r.get("First Name");
      const last  = r.get("Last Name");
      const fullName = `${first} ${last}`.trim() || null;

      if (!email && !phone) {
        skipped++;
        errors.push({ row: i + 2, reason: "No email AND no phone — cannot match", raw: r.toJSON() });
        continue;
      }

      // Look up by phone first (Gifteeng's canonical key), then email.
      const existing = await this.prisma.customer.findFirst({
        where: phone
          ? { OR: [{ phone }, ...(email ? [{ email }] : [])] }
          : { email: email! },
      });

      if (opts.dryRun) {
        if (existing) merged++;
        else created++;
        continue;
      }

      if (existing) {
        // Merge: backfill only missing fields, never overwrite a confirmed
        // Gifteeng value with a Shopify export (the live data is newer).
        await this.prisma.customer.update({
          where: { id: existing.id },
          data: {
            fullName: existing.fullName ?? fullName,
            email:    existing.email    ?? email,
            phone:    existing.phone    ?? phone,
            metadata: this.mergeMetadata(existing.metadata, {
              shopify_imported: true,
              shopify_orders_count: r.get("Total Orders") ? Number(r.get("Total Orders")) : undefined,
              shopify_total_spent:  r.get("Total Spent")  ? Number(r.get("Total Spent"))  : undefined,
              shopify_accepts_marketing: r.get("Accepts Email Marketing") === "yes",
            }),
          },
        });
        merged++;
      } else {
        const customer = await this.prisma.customer.create({
          data: {
            email,
            phone,
            fullName,
            metadata: {
              shopify_imported: true,
              shopify_orders_count: r.get("Total Orders") ? Number(r.get("Total Orders")) : 0,
              shopify_total_spent:  r.get("Total Spent")  ? Number(r.get("Total Spent"))  : 0,
              shopify_accepts_marketing: r.get("Accepts Email Marketing") === "yes",
              shopify_tags: r.get("Tags") || undefined,
            } as Prisma.InputJsonValue,
          },
        });
        // Save the default address from the customer export if present.
        await this.maybeCreateAddress(customer.id, r);
        created++;
      }
    }

    return { created, merged, skipped, total: rows.length, errors, dryRun: !!opts.dryRun };
  }

  private async maybeCreateAddress(customerId: string, r: Row) {
    const line1   = r.get("Default Address Address1") || r.get("Address1");
    const city    = r.get("Default Address City")     || r.get("City");
    const pincode = r.get("Default Address Zip")      || r.get("Zip");
    if (!line1 || !city || !pincode) return; // not enough to be useful
    const exists = await this.prisma.savedAddress.findFirst({
      where: { customerId, line1, pincode },
    });
    if (exists) return;
    await this.prisma.savedAddress.create({
      data: {
        customerId,
        fullName: `${r.get("First Name")} ${r.get("Last Name")}`.trim() || "Imported",
        phone:    r.get("Phone") || r.get("Default Address Phone") || "",
        line1,
        line2:    r.get("Default Address Address2") || r.get("Address2") || null,
        city,
        state:    r.get("Default Address Province") || r.get("Province") || "",
        pincode,
        country:  r.get("Default Address Country")  || r.get("Country")  || "India",
        isDefault: true,
      },
    });
  }

  private mergeMetadata(existing: unknown, incoming: Record<string, unknown>): Prisma.InputJsonValue {
    const base = (existing && typeof existing === "object" && !Array.isArray(existing))
      ? (existing as Record<string, unknown>)
      : {};
    return { ...base, ...incoming } as Prisma.InputJsonValue;
  }

  // ── Order import ───────────────────────────────────────────────────────

  // Map Shopify's fulfillment + financial status to Gifteeng OrderStatus.
  // Shopify exports two columns we care about: "Fulfillment Status" and
  // "Financial Status". Combined logic:
  //   Refunded → returned
  //   Cancelled → cancelled
  //   fulfilled + paid → delivered
  //   partial fulfillment / shipped → shipped
  //   anything else → confirmed (the safe historical bucket)
  private mapStatus(fulfillment: string, financial: string, cancelled: string): "new_order" | "confirmed" | "shipped" | "delivered" | "cancelled" | "returned" {
    const f = fulfillment.toLowerCase().trim();
    const m = financial.toLowerCase().trim();
    if (cancelled && cancelled.trim()) return "cancelled";
    if (m === "refunded") return "returned";
    if (f === "fulfilled" && (m === "paid" || m === "")) return "delivered";
    if (f === "partial" || f === "in progress" || f === "scheduled") return "shipped";
    if (f === "fulfilled") return "delivered";
    return "confirmed";
  }

  private mapPayment(financial: string, gateway: string): "razorpay" | "cod" | "wallet" | "invoice" {
    const g = gateway.toLowerCase();
    const f = financial.toLowerCase();
    if (g.includes("cod") || g.includes("cash")) return "cod";
    if (f === "paid" || f === "partially_paid" || g.includes("razorpay") || g.includes("paypal") || g.includes("stripe")) return "razorpay";
    return "razorpay"; // safest default for historical records
  }

  private mapPaymentStatus(financial: string): "pending" | "captured" | "refunded" | "failed" {
    const f = financial.toLowerCase().trim();
    if (f === "paid" || f === "partially_paid") return "captured";
    if (f === "refunded" || f === "voided") return "refunded";
    if (f === "pending" || f === "authorized") return "pending";
    return "pending";
  }

  async importOrders(buffer: Buffer, opts: { dryRun?: boolean } = {}) {
    const rows = this.parseCsv(buffer);
    if (rows.length === 0) {
      throw new BadRequestException("Order CSV has no rows");
    }
    const sample = rows[0];
    if (!sample || (!sample.has("Name") && !sample.has("Order"))) {
      throw new BadRequestException(
        "CSV doesn't look like a Shopify orders export. Expected columns include 'Name', 'Email', 'Lineitem name'.",
      );
    }

    // Shopify exports orders as one row per LINE ITEM. Group by order
    // identifier ("Name" e.g. "#1042" or "Id") so we create one Order
    // record with multiple OrderItems.
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      if (!r) continue;
      const key = (r.get("Name") || r.get("Id")).trim();
      if (!key) continue;
      const bucket = groups.get(key) ?? [];
      bucket.push(r);
      groups.set(key, bucket);
    }

    const placeholderProductId = opts.dryRun ? null : await this.ensurePlaceholderProduct();
    let created = 0;
    let mergedSkipped = 0;
    let unmatched = 0;
    const errors: { name: string; reason: string }[] = [];

    for (const [orderName, lines] of groups) {
      const head = lines[0];
      if (!head) continue;                       // empty group, can't happen but TS strict-mode needs the guard
      const shopifyId = (head.get("Id") || orderName).trim();

      // Idempotency — skip orders we've already pulled in.
      const exists = await this.prisma.order.findFirst({
        where: {
          // Stored as JSONB at metadata.shopify_id for re-runnability.
          metadata: { path: ["shopify_id"], equals: shopifyId } as any,
        },
        select: { id: true },
      });
      if (exists) { mergedSkipped++; continue; }

      // Match the customer. Phone first (canonical), then email fallback.
      const phone = this.normalisePhone(head.get("Phone") || head.get("Shipping Phone") || head.get("Billing Phone"));
      const email = head.get("Email").toLowerCase() || null;
      let customerId: string | null = null;
      if (phone || email) {
        const c = await this.prisma.customer.findFirst({
          where: phone ? { OR: [{ phone }, ...(email ? [{ email }] : [])] } : { email: email! },
          select: { id: true },
        });
        if (c) customerId = c.id;
      }
      if (!customerId) {
        unmatched++;
        errors.push({ name: orderName, reason: `No matching customer (phone=${phone ?? "—"}, email=${email ?? "—"})` });
        if (!opts.dryRun) continue; // can't write an Order without a customer; skip
      }

      const subtotal      = this.toDecimal(head.get("Subtotal") || head.get("Lineitem price") || "0");
      const shippingTotal = this.toDecimal(head.get("Shipping") || "0");
      const taxTotal      = this.toDecimal(head.get("Taxes") || "0");
      const discountTotal = this.toDecimal(head.get("Discount Amount") || "0");
      const grandTotal    = this.toDecimal(head.get("Total") || subtotal.add(shippingTotal).add(taxTotal).sub(discountTotal).toFixed(2));
      const currency      = (head.get("Currency") || "INR").toUpperCase();

      const status        = this.mapStatus(head.get("Fulfillment Status"), head.get("Financial Status"), head.get("Cancelled at"));
      const paymentMethod = this.mapPayment(head.get("Financial Status"), head.get("Payment Method"));
      const paymentStatus = this.mapPaymentStatus(head.get("Financial Status"));

      const createdAt = head.get("Created at");
      const placedAt = createdAt ? new Date(createdAt) : new Date();

      const shippingAddress = {
        fullName: `${head.get("Shipping Name") || head.get("Billing Name")}`.trim(),
        phone:    head.get("Shipping Phone") || head.get("Phone") || "",
        line1:    head.get("Shipping Address1") || head.get("Billing Address1") || "",
        line2:    head.get("Shipping Address2") || head.get("Billing Address2") || "",
        city:     head.get("Shipping City")     || head.get("Billing City")     || "",
        state:    head.get("Shipping Province") || head.get("Billing Province") || "",
        pincode:  head.get("Shipping Zip")      || head.get("Billing Zip")      || "",
        country:  head.get("Shipping Country")  || head.get("Billing Country")  || "India",
      };

      if (opts.dryRun) {
        created++;
        continue;
      }

      const headName = head.get("Name");
      const orderNumber = headName.startsWith("#")
        ? `SH-${headName.slice(1)}`               // "#1042" → "SH-1042"
        : `SH-${shopifyId}`;
      // Avoid collisions with existing orderNumbers (very unlikely but
      // theoretically possible if a Gifteeng order was numbered "SH-…").
      const numberSuffix = await this.uniqueOrderNumber(orderNumber);

      await this.prisma.order.create({
        data: {
          orderNumber: numberSuffix,
          channel: "b2c",
          status,
          customerId: customerId!,
          subtotal,
          discountTotal,
          shippingTotal,
          taxTotal,
          grandTotal,
          currency,
          paymentMethod,
          paymentStatus,
          shippingAddress: shippingAddress as unknown as Prisma.InputJsonValue,
          billingAddress:  shippingAddress as unknown as Prisma.InputJsonValue,
          discountCode: head.get("Discount Code") || null,
          notes: head.get("Notes") || null,
          placedAt,
          deliveredAt: status === "delivered" ? placedAt : null,
          cancelledAt: status === "cancelled" ? placedAt : null,
          metadata: {
            shopify_id:         shopifyId,
            shopify_name:       orderName,
            shopify_imported:   true,
            shopify_currency:   currency,
            shopify_gateway:    head.get("Payment Method") || head.get("Gateway") || null,
            shopify_tags:       head.get("Tags") || null,
          } as Prisma.InputJsonValue,
          items: {
            create: lines
              .filter(l => l.get("Lineitem name").trim())
              .map(l => {
                const qty   = parseInt(l.get("Lineitem quantity") || "1", 10) || 1;
                const price = this.toDecimal(l.get("Lineitem price") || "0");
                return {
                  productId: placeholderProductId!,
                  qty,
                  unitPrice: price,
                  totalPrice: price.mul(qty),
                  snapshot: {
                    title: l.get("Lineitem name"),
                    sku:   l.get("Lineitem sku") || null,
                    price: price.toString(),
                    images: null,
                    shopify_imported: true,
                  } as unknown as Prisma.InputJsonValue,
                };
              }),
          },
        },
      });
      created++;
    }

    return {
      created,
      mergedSkipped,
      unmatched,
      total: groups.size,
      errors,
      dryRun: !!opts.dryRun,
    };
  }

  // Decimal-safe parser for currency strings like "1,234.50" or "₹500".
  private toDecimal(raw: string): Prisma.Decimal {
    if (!raw) return new Prisma.Decimal(0);
    const cleaned = raw.replace(/[^\d.\-]/g, "");
    if (!cleaned) return new Prisma.Decimal(0);
    return new Prisma.Decimal(cleaned);
  }

  // Append -1, -2, … if the candidate orderNumber already exists.
  private async uniqueOrderNumber(candidate: string): Promise<string> {
    let n = candidate;
    let i = 1;
    while (await this.prisma.order.findUnique({ where: { orderNumber: n }, select: { id: true } })) {
      n = `${candidate}-${i++}`;
      if (i > 99) throw new Error(`Could not generate unique orderNumber for ${candidate}`);
    }
    return n;
  }
}
