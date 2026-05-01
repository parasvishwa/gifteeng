#!/usr/bin/env bash
# Deploy: phone normalization fix — merges duplicate customer accounts on login
#
# Changes:
#   API:  auth-b2c.service.ts — normalizePhone() + legacy account migration
#   Web:  auth/page.tsx       — normalisePhone() produces +91XXXXXXXXXX
#   Web:  account/page.tsx    — orders pageSize=100, Goins shows totalBalance
#
# Prereq: scp deploy/patch_phone_fix.tar.gz root@217.216.59.87:/tmp/
# Run on server as root:
#   bash /tmp/deploy-phone-fix.sh

set -euo pipefail
log() { echo ""; echo "==> $*"; }

PATCH=/tmp/patch_phone_fix.tar.gz
REPO=/srv/gifteeng

log "Extracting patch"
tar xzf "$PATCH" -C "$REPO"
echo "  Files extracted"

log "Rebuilding API + Web in background"
nohup bash -c "
  set -e
  cd $REPO
  echo '[phone-fix] building api...'
  pnpm --filter @gifteeng/api build > /tmp/phone_fix_api.log 2>&1
  echo '[phone-fix] restarting api...'
  systemctl restart gifteeng-api
  sleep 3
  echo '[phone-fix] building web...'
  pnpm --filter @gifteeng/web build > /tmp/phone_fix_web.log 2>&1
  echo '[phone-fix] restarting web...'
  systemctl restart gifteeng-web
  sleep 3
  curl -s http://127.0.0.1:4000/api/health && echo '[phone-fix] api healthy'
  echo '[phone-fix] DONE'
" > /tmp/phone_fix_main.log 2>&1 &

echo ""
echo "==> Deploy dispatched. Monitor with:"
echo "    tail -f /tmp/phone_fix_main.log"
echo "    tail -f /tmp/phone_fix_api.log"
echo "    tail -f /tmp/phone_fix_web.log"
