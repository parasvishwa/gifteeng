#!/bin/bash
set -e
cd /srv/gifteeng
tar xzf /tmp/patch_session34.tar.gz
pnpm --filter=@gifteeng/web build
systemctl restart gifteeng-web
sleep 5
curl -fsS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000
