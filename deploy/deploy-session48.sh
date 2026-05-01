#!/bin/bash
set -e
cd /srv/gifteeng
tar xzf /tmp/patch_session48.tar.gz
pnpm --filter=@gifteeng/web build
systemctl restart gifteeng-web
sleep 5
curl -fsS -o /dev/null -w "Web: %{http_code}\n" http://127.0.0.1:3000
curl -fsS -o /dev/null -w "ZIP: %{http_code} (%{size_download} bytes)\n" http://127.0.0.1:3000/gifteeng-review-grabber.zip
