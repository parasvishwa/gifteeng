#!/usr/bin/env bash
# session50 — bulletproof bulk-import (no more 500s) + extension v1.1
#
#   • external-reviews.service.bulkImport now wraps the entire method in
#     try/catch and ALWAYS returns 200. Failure modes surface as
#     {ok:false, error:"..."} in the response body.
#   • Logs every call + every row failure via NestJS Logger so
#     `journalctl -u gifteeng-api -f` shows what actually went wrong.
#   • Extension rebuilt to v1.1: Amazon scraper pre-scrolls reviews into
#     view + waits 1.5s for lazy-load, captures images via background-image
#     and from <video><source> tags, has a regex fallback for .mp4 URLs.
#   • Popup shows image/video counts in fetch status and surfaces network
#     errors explicitly so a button click can never silently do nothing.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session50.tar.gz

# Only the API source changed for the build — extension is static + the zip
# in /apps/web/public is served straight by Next.js.
pnpm --filter=@gifteeng/db prisma generate
pnpm --filter=@gifteeng/api build

systemctl restart gifteeng-api
sleep 5
curl -fsS http://127.0.0.1:4000/api/health
echo
echo "DEPLOY_OK"
