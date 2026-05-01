#!/usr/bin/env bash
# session61 — Suppress expected 401 noise + auto-redirect on admin 401 (#52)
#
# Web:
#   • AnalyticsTracker fetch wrapper now skips 401/403 from /api/admin/*,
#     /api/me/*, and any */events endpoint — these are expected when a
#     user lands on a guarded page without a token, not real bugs. Network
#     failures on SSE /events also skipped (the RealtimeSync component
#     reconnects naturally on disconnect / sleep / network flap).
#   • adminGet / adminPost / adminPatch / adminPut / adminDelete now
#     redirect to /b2b/login?redirect=<here> on 401 once per tab so a
#     stale-token user self-heals instead of seeing a broken page.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session61.tar.gz
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session61"
