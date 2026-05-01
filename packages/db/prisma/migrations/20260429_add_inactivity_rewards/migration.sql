-- Inactivity Goin Rewards — re-engagement drops to dormant customers.
-- Single-row config table + per-award log to enforce cooldown and lifetime caps.

CREATE TABLE "inactivity_reward_config" (
    "id"                   TEXT         NOT NULL DEFAULT 'default',
    "enabled"              BOOLEAN      NOT NULL DEFAULT false,
    "minGoins"             INTEGER      NOT NULL DEFAULT 50,
    "maxGoins"             INTEGER      NOT NULL DEFAULT 500,
    "minInactiveDays"      INTEGER      NOT NULL DEFAULT 7,
    "cooldownDays"         INTEGER      NOT NULL DEFAULT 14,
    "maxLifetimePerUser"   INTEGER      NOT NULL DEFAULT 6,
    "dailyDropRate"        INTEGER      NOT NULL DEFAULT 20,
    "pushTitleTemplate"    TEXT         NOT NULL DEFAULT '🎁 We missed you, {firstName}!',
    "pushBodyTemplate"     TEXT         NOT NULL DEFAULT 'We''ve added {amount} Goins to your wallet. Find a gift to brighten someone''s day.',
    "ctaUrl"               TEXT         NOT NULL DEFAULT '/goins',
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inactivity_reward_config_pkey" PRIMARY KEY ("id")
);

-- Seed the default config row so the admin page has something to load.
INSERT INTO "inactivity_reward_config" ("id", "updatedAt") VALUES ('default', NOW());

CREATE TABLE "inactivity_reward_sent" (
    "id"           UUID         NOT NULL DEFAULT gen_random_uuid(),
    "customerId"   UUID         NOT NULL,
    "amount"       INTEGER      NOT NULL,
    "inactiveDays" INTEGER      NOT NULL,
    "pushSent"     BOOLEAN      NOT NULL DEFAULT false,
    "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inactivity_reward_sent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inactivity_reward_sent_customerId_sentAt_idx"
    ON "inactivity_reward_sent"("customerId", "sentAt");

CREATE INDEX "inactivity_reward_sent_sentAt_idx"
    ON "inactivity_reward_sent"("sentAt");
