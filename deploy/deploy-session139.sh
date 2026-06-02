#!/usr/bin/env bash
# session139 — admin fixes: remove "Business portal" header text,
#   fix stuck loading spinner in AdminLayout (replace full-screen spinner
#   with null so auth resolves transparently instead of freezing the UI).
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session139.tar.gz

pnpm --filter @gifteeng/web build 2>&1 | tail -6

systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session139"
