#!/usr/bin/env bash
set -euo pipefail

cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session41.tar.gz

pnpm --filter=@gifteeng/api build

systemctl restart gifteeng-api
sleep 5

curl -fsS http://127.0.0.1:4000/api/health
echo

# Verify the previously-404 endpoints now work
curl -fsS -o /dev/null -w "GET /reviews: %{http_code}\n" "http://127.0.0.1:4000/api/reviews?limit=5"
curl -fsS -o /dev/null -w "GET /settings/homepage_announcement_bar: %{http_code}\n" "http://127.0.0.1:4000/api/settings/homepage_announcement_bar"
