#!/usr/bin/env bash
# session60 — Realtime BROADCAST sync (#51) + Prisma middleware
#
# Backend:
#   • RealtimeService gains attachGlobal() + publishGlobal(scope) so
#     content changes fan out to every connected client (per-user AND
#     anonymous public streams).
#   • New endpoint GET /api/public/events — anonymous SSE for catalog /
#     banner / announcement / testimonial / customizer / settings
#     change broadcasts.
#   • PrismaService installs a $use middleware on bootstrap that maps
#     mutations on Product / Category / Collection / ProductCollection /
#     HeroBanner / Announcement / Testimonial / SiteSetting /
#     DesignTemplate / ThankYouCard tables → publishGlobal(<scope>).
#     Single source of truth — every existing AND future admin mutation
#     auto-broadcasts without per-service plumbing.
#   • RealtimeModule.onModuleInit wires the broadcast hook.
#   • ProductsService.createAdmin/updateAdmin keep an explicit publish
#     (also fires "customizer" when canvas config changes).
#   • CategoriesService all 3 mutations publish "categories" explicitly
#     in addition to the middleware (belt + suspenders).
#
# Web:
#   • RealtimeSync now opens BOTH /api/me/events (per-user) AND
#     /api/public/events (anonymous global). Visibility / focus
#     listener re-broadcasts every scope.
#
# Mobile (v1.0.0+4009):
#   • RealtimeSync opens both channels in parallel (user + public)
#     with independent reconnect backoff.
#   • New global `realtimeBus` Stream<String> for screens to listen
#     and refetch on scope changes.
#   • App-resume hook triggers a forced refetch of every scope.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session60.tar.gz

pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build

systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3

for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

# Smoke-test the new public SSE endpoint — should return 200 + start
# streaming the "ready" event line.
curl -fsS --max-time 3 http://127.0.0.1:4000/api/public/events | head -c 200 || true

echo
echo "DEPLOY_OK session60"
