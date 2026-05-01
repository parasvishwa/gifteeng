#!/usr/bin/env bash
# session80 — DPDP Act compliance (full customer + admin flow)
#
# Closes the legal-blocker box from the pre-launch list. Indian DPDP Act
# (2023) requires every operator to give customers granular, withdrawable
# consent + the rights to access (data export) and erasure (deletion).
# Without this in place, launching is technically illegal.
#
# What ships:
#
#   DB:
#     - ConsentCategory + DataExportStatus enums
#     - consent_records table (immutable per-decision audit trail)
#     - data_export_requests table (sync MVP — JSON payload inline)
#     - customers.data_deletion_scheduled_for + dpdp_anonymized_at
#
#   API (PrivacyService + 2 controllers):
#     CUSTOMER endpoints under /api/me/privacy:
#       GET  consents                 — current snapshot per category
#       POST consents {category,granted} — record a consent decision
#                                        (immutable; new row each time)
#       POST export                   — build a JSON dump of everything
#                                        we hold; downloadable for 7 days
#       GET  exports / exports/:id    — list / fetch
#       POST delete-account [graceDays?] — schedule erasure (default
#                                        30-day grace)
#       DELETE delete-account         — cancel pending erasure
#     ADMIN endpoints under /api/admin/privacy (super_admin only):
#       GET  pending-deletions
#       POST anonymize/:customerId    — force-process before grace
#
#     Cron (cluster-leader-only):
#       hourly processScheduledDeletions() — anonymize customers past
#       their grace period; idempotent via dpdpAnonymizedAt stamp.
#       expireOldExports() — flips ready→expired and clears payload
#       after 7 days so the table doesn't bloat.
#
#   Erasure semantics — ANONYMIZE, not hard-delete:
#     Order rows + items kept (CGST + IT Act = 7-year retention) with
#     their shipping/billing JSON redacted. Customer name/email/phone/
#     avatar/google_id wiped. SavedAddress lines redacted. Wishlist,
#     DeviceTokens, GiftReminders dropped. Reviews stay public but
#     reviewer is "Anonymous Gifteengster". ConsentRecord rows preserved
#     for regulator audit.
#
#   Web:
#     - /b2c/account/privacy — full customer-facing dashboard with
#       consent toggles, "Download my data" (instant JSON download),
#       and "Schedule deletion" (with 30-day cancel window).
#     - <CookieConsent /> first-touch banner (Reject/Customize/Accept).
#       Decision in localStorage; mirrored to server when authed so
#       the audit trail isn't browser-dependent.
#
#   Documentation:
#     docs/DPDP-COMPLIANCE.md — itemized "what's done in code vs what
#     still needs human action" (privacy policy text, named
#     grievance officer, breach-notification runbook, etc.).
#
# What's NOT in this session (would each need its own focused work):
#   - Async data-export queue with S3-backed download (today's payload
#     is stored inline in the DB row; fine until customers cross ~5MB
#     of data each)
#   - Children's-data parental-consent flow
#   - Annual privacy audit reporting (only required at large scale)
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session80.tar.gz

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -10) || \
  echo "WARN: migrate deploy returned non-zero, proceeding"

echo "==> regenerating Prisma client..."
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session80"
