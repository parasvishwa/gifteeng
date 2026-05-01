#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Gifteeng deploy — runs on the Contabo VPS after bootstrap
# ═══════════════════════════════════════════════════════════════════════════
#
#  Idempotent — safe to re-run on every code change.
#  pnpm install + Prisma generate + migrate deploy + build + restart services.
#
#  Usage (as root):
#    bash /srv/gifteeng/deploy/deploy.sh
#
#  Assumes bootstrap-contabo.sh has already run.
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
log() { echo ""; echo "==> $*"; }

: "${GIFTEENG_USER:=gifteeng}"
: "${GIFTEENG_DIR:=/srv/gifteeng}"

if [[ ! -f "${GIFTEENG_DIR}/.env" ]]; then
  echo "ERROR: ${GIFTEENG_DIR}/.env not found. Run bootstrap-contabo.sh first." >&2
  exit 1
fi

cd "${GIFTEENG_DIR}"

# Use the service user for pnpm/node so node_modules ownership stays clean.
RUN_AS_USER=("sudo" "-u" "${GIFTEENG_USER}" "-H")

log "pnpm install"
"${RUN_AS_USER[@]}" pnpm install --prod=false

log "Building @gifteeng/shared"
"${RUN_AS_USER[@]}" pnpm --filter @gifteeng/shared build || true

log "Generating Prisma client"
"${RUN_AS_USER[@]}" bash -c "set -a && source ${GIFTEENG_DIR}/.env && set +a && pnpm --filter @gifteeng/db prisma generate"

log "Running Prisma migrate deploy"
"${RUN_AS_USER[@]}" bash -c "set -a && source ${GIFTEENG_DIR}/.env && set +a && pnpm --filter @gifteeng/db prisma migrate deploy"

# Seed only if DB is empty
log "Checking seed state"
HAS_COMPANIES=$(sudo -u postgres psql -d gifteeng -tAc "SELECT COUNT(*) FROM companies;" 2>/dev/null || echo 0)
if [[ "${HAS_COMPANIES}" == "0" ]]; then
  log "DB empty, running seed"
  "${RUN_AS_USER[@]}" bash -c "set -a && source ${GIFTEENG_DIR}/.env && set +a && pnpm --filter @gifteeng/db seed" || echo "Seed failed (non-fatal)"
else
  log "DB has ${HAS_COMPANIES} companies, skipping seed"
fi

log "Building @gifteeng/api"
"${RUN_AS_USER[@]}" pnpm --filter @gifteeng/api build

log "Building @gifteeng/web"
"${RUN_AS_USER[@]}" pnpm --filter @gifteeng/web build

log "Restarting services"
systemctl enable gifteeng-api gifteeng-web >/dev/null 2>&1 || true
systemctl restart gifteeng-api
sleep 2
systemctl restart gifteeng-web
sleep 3

log "Health checks"
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  ✅ api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done

for i in 1 2 3 4 5; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/ 2>&1; then
    echo "  ✅ web / ok"
    break
  fi
  echo "  ... web not ready yet (attempt $i/5)"
  sleep 2
done

echo ""
echo "=========================================================="
echo "  DEPLOY COMPLETE"
echo "=========================================================="
echo "  API        : http://127.0.0.1:4000/api  (via nginx on new-api.gifteeng.com)"
echo "  Web        : http://127.0.0.1:3000      (via nginx on new.gifteeng.com, new-business.gifteeng.com)"
echo "  Logs API   : journalctl -u gifteeng-api -f"
echo "  Logs Web   : journalctl -u gifteeng-web -f"
echo "  Restart    : systemctl restart gifteeng-api gifteeng-web"
echo "  Status     : systemctl status gifteeng-api gifteeng-web"
