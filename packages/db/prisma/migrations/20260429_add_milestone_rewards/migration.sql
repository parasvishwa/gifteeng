-- MilestoneReward — every-Nth signup gets X Goins + celebration push.
-- Two counters: web (signups via website) and app (signups via Flutter).

CREATE TABLE "milestone_reward_config" (
    "id"          TEXT         NOT NULL DEFAULT 'default',
    -- Web milestone
    "webEnabled"  BOOLEAN      NOT NULL DEFAULT true,
    "webEvery"    INTEGER      NOT NULL DEFAULT 100,
    "webGoins"    INTEGER      NOT NULL DEFAULT 1000,
    "webTitle"    TEXT         NOT NULL DEFAULT '🎉 You''re our {position}th visitor!',
    "webBody"     TEXT         NOT NULL DEFAULT 'As our {position}th website visitor, we''ve credited {amount} Goins to your wallet — happy gifting, {firstName}!',
    "webCounter"  INTEGER      NOT NULL DEFAULT 0,
    -- App milestone
    "appEnabled"  BOOLEAN      NOT NULL DEFAULT true,
    "appEvery"    INTEGER      NOT NULL DEFAULT 100,
    "appGoins"    INTEGER      NOT NULL DEFAULT 1000,
    "appTitle"    TEXT         NOT NULL DEFAULT '🎉 You''re our {position}th app user!',
    "appBody"     TEXT         NOT NULL DEFAULT 'As our {position}th app downloader, we''ve credited {amount} Goins to your wallet — enjoy, {firstName}!',
    "appCounter"  INTEGER      NOT NULL DEFAULT 0,
    "ctaUrl"      TEXT         NOT NULL DEFAULT '/goins',
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_reward_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "milestone_reward_config" ("id", "updatedAt") VALUES ('default', NOW());

CREATE TABLE "milestone_reward_sent" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "customerId"  UUID         NOT NULL,
    "kind"        TEXT         NOT NULL,
    "position"    INTEGER      NOT NULL,
    "amount"      INTEGER      NOT NULL,
    "pushSent"    BOOLEAN      NOT NULL DEFAULT false,
    "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_reward_sent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "milestone_reward_sent_customerId_sentAt_idx"
    ON "milestone_reward_sent"("customerId", "sentAt");
CREATE INDEX "milestone_reward_sent_sentAt_idx"
    ON "milestone_reward_sent"("sentAt");
CREATE INDEX "milestone_reward_sent_kind_sentAt_idx"
    ON "milestone_reward_sent"("kind", "sentAt");
