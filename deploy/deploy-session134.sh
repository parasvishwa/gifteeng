#!/usr/bin/env bash
# session134 — marketplace Phase 1c/1d: seller portal + super-admin seller queue (web-only)
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session134.tar.gz

# Web-only change — build web only
pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
curl -fsS -o /dev/null -w 'seller portal HTTP %{http_code}\n' http://127.0.0.1:3000/seller/login

echo "DEPLOY_OK session134"
