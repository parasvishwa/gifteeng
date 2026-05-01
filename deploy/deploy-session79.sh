#!/usr/bin/env bash
# session79 — security hardening (round 1)
#
# Code-side fixes that match the infra-side work already applied directly
# to the VPS (UFW lock-down of :8888 :9090 :8080, filebrowser stopped +
# masked, cockpit socket disabled, encrypted gpg-symmetric backups with
# 14-day retention, legacy plaintext backups shredded).
#
# What ships in this deploy:
#
#   1. /api/files/upload — was UNAUTHENTICATED with no size/MIME limits.
#      Now requires a valid b2c OR b2b JWT (verified inline because Nest
#      AuthGuards don't natively support OR), enforces a 25 MB size cap
#      via multer.limits.fileSize, and rejects everything that isn't an
#      explicit image/* allowlist. Closes the disk-fill / arbitrary-host
#      attack surface that anyone on the internet had access to.
#      Also now requires b2b JWT for: GET /files (asset list), POST
#      /files/upload/product, POST /files/upload-from-url (SSRF-class
#      endpoint), PATCH /files/:id/replace.
#
#   2. JWT secret startup assertion — `assertProductionSecrets()` runs
#      before bootstrap. Refuses to start when JWT_B2C_SECRET,
#      JWT_B2B_SECRET, FILES_SIGNING_SECRET, or DATABASE_URL is missing,
#      shorter than the safe minimum, or looks like a placeholder
#      ("dev-…", "changeme", "secret"). Skipped only when
#      NODE_ENV=development. Removes the silent fallback to literal
#      "dev-b2c" / "dev-b2b" that previously made forgeable tokens
#      possible if .env failed to load.
#
#   3. Razorpay webhook signature compare — was `expected !== signature`
#      (string equality, leaks matching-prefix length to a careful
#      timing-attack). Now uses `crypto.timingSafeEqual` on equal-length
#      buffers and throws "secret not configured" early if the env is
#      missing.
#
# Skipped (will need their own focused sessions):
#   - Admin MFA / TOTP — needs a new Prisma column, totp library wiring,
#     enroll + verify flows, recovery codes UI. ~1 day.
#   - DPDP data-export / data-delete endpoints — needs a queue (huge
#     payloads), an audit-log of consent changes, the actual erase
#     cascade across 30+ tables. ~1 day.
#   - localStorage-JWT → httpOnly cookie migration on web — invasive
#     because Flutter app uses Bearer header; would force a forked
#     auth flow per platform.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session79.tar.gz
pnpm --filter @gifteeng/api build 2>&1 | tail -5
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
echo "DEPLOY_OK session79"
