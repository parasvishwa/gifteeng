-- Single-use invite token for B2B team-member onboarding.
-- Replaces the email-only setPassword flow (account-takeover vector — anyone
-- who guessed an invited user's email could claim their account before the
-- invitee did). See docs/SECURITY_AUDIT.md finding C-3.
--
-- The token itself is never stored — only sha256(token). The plaintext is
-- returned ONCE in the invite API response and embedded in the invite URL
-- the operator shares out-of-band. On accept, the hashed lookup is constant-
-- time-safe (one row by index) and the row's hash is wiped after use.

ALTER TABLE "company_users"
  ADD COLUMN "inviteTokenHash"      TEXT,
  ADD COLUMN "inviteTokenExpiresAt" TIMESTAMP(3);

CREATE INDEX "company_users_inviteTokenHash_idx" ON "company_users" ("inviteTokenHash");
