-- Cart abandonment recovery — admin-configurable notification campaigns.
-- Rules define when/how to nudge customers with idle carts; sent records
-- prevent duplicate sends and feed analytics.

CREATE TABLE "cart_recovery_rules" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "name"            TEXT         NOT NULL,
    "triggerMinutes"  INTEGER      NOT NULL,
    "minCartValue"    INTEGER,
    "maxCartValue"    INTEGER,
    "loggedInOnly"    BOOLEAN      NOT NULL DEFAULT true,
    "title"           TEXT         NOT NULL,
    "body"            TEXT         NOT NULL,
    "ctaText"         TEXT         NOT NULL DEFAULT 'View cart',
    "ctaUrl"          TEXT         NOT NULL DEFAULT '/cart',
    "cooldownHours"   INTEGER      NOT NULL DEFAULT 48,
    "isActive"        BOOLEAN      NOT NULL DEFAULT true,
    "sortOrder"       INTEGER      NOT NULL DEFAULT 0,
    "sentCount"       INTEGER      NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_recovery_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cart_recovery_rules_isActive_sortOrder_idx"
    ON "cart_recovery_rules"("isActive", "sortOrder");

CREATE TABLE "cart_recovery_sent" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "ruleId"      UUID         NOT NULL,
    "customerId"  UUID         NOT NULL,
    "cartValue"   INTEGER      NOT NULL,
    "itemCount"   INTEGER      NOT NULL,
    "channel"     TEXT         NOT NULL DEFAULT 'push',
    "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_recovery_sent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cart_recovery_sent_ruleId_fkey"
        FOREIGN KEY ("ruleId") REFERENCES "cart_recovery_rules"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "cart_recovery_sent_customerId_sentAt_idx"
    ON "cart_recovery_sent"("customerId", "sentAt");

CREATE INDEX "cart_recovery_sent_ruleId_sentAt_idx"
    ON "cart_recovery_sent"("ruleId", "sentAt");

-- Seed three default rules (gentle → emotional → urgent) covering 1h / 6h / 24h.
INSERT INTO "cart_recovery_rules"
  ("id", "name", "triggerMinutes", "title", "body", "ctaText", "ctaUrl",
   "cooldownHours", "sortOrder", "sentCount", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(),
   'Gentle nudge — 1 hour',
   60,
   'Hey {firstName}, your gifts are waiting 💝',
   '{itemCount} thoughtful pick(s) are still in your cart. Make someone smile today!',
   'Continue shopping',
   '/cart',
   48, 1, 0, NOW(), NOW()),

  (gen_random_uuid(),
   'Sweet temptation — 6 hours',
   360,
   'Still thinking about {firstItem}? 🤔',
   'Don''t let your perfect gift slip away — it''s still right there in your cart, just for you.',
   'Take a second look',
   '/cart',
   72, 2, 0, NOW(), NOW()),

  (gen_random_uuid(),
   'Last chance — 24 hours',
   1440,
   '⏰ Last call for {firstItem}!',
   'Items in your cart move fast. Lock yours in now before someone else snags them.',
   'Checkout now',
   '/checkout',
   168, 3, 0, NOW(), NOW());
