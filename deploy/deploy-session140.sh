#!/usr/bin/env bash
# session140 — fix login page blank: server-render dark shell so background appears instantly
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session140.tar.gz
pnpm --filter @gifteeng/web build 2>&1 | tail -6
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/
echo "DEPLOY_OK session140"
