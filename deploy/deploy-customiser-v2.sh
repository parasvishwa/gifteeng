#!/usr/bin/env bash
# Customiser v2 deploy — single-screen Customiser refactor.
#
# Usage (from your local machine):
#   bash deploy/deploy-customiser-v2.sh
#
# Assumes the patch tarball already exists at deploy/patch_customiser_v2.tar.gz
# (created by the Customiser v2 work, contains the three updated files).
set -euo pipefail

PATCH=deploy/patch_customiser_v2.tar.gz
HOST=root@217.216.59.87

if [[ ! -f "$PATCH" ]]; then
  echo "Patch tarball missing: $PATCH" >&2
  exit 1
fi

scp "$PATCH" "$HOST":/tmp/

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd /srv/gifteeng
tar xzf /tmp/patch_customiser_v2.tar.gz
pnpm --filter=@gifteeng/web build
systemctl restart gifteeng-web
sleep 5
curl -fsS http://127.0.0.1:4000/api/health
echo
echo "DEPLOY_OK"
REMOTE
