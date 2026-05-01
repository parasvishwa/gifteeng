#!/usr/bin/env bash
set -e

echo "=== deploy-session24: wishlist UI + customizer metadata fix ==="

cd /srv/gifteeng

echo "--- Extracting patch ---"
tar xzf /tmp/patch_session24.tar.gz
echo "Extraction OK"

echo "--- Building @gifteeng/web ---"
pnpm --filter=@gifteeng/web build 2>&1 | tail -30

echo "--- Restarting service ---"
if systemctl is-active --quiet gifteeng-web 2>/dev/null; then
  systemctl restart gifteeng-web
  echo "Restarted via systemctl"
elif pm2 list 2>/dev/null | grep -q gifteeng-web; then
  pm2 restart gifteeng-web
  echo "Restarted via pm2"
elif pm2 list 2>/dev/null | grep -q web; then
  pm2 restart web
  echo "Restarted pm2 'web'"
else
  echo "WARNING: no known service manager found for gifteeng-web"
fi

echo "--- Health check ---"
sleep 3
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000 || echo "FAILED")
echo "http://127.0.0.1:3000 => HTTP $HTTP_CODE"

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "307" ] || [ "$HTTP_CODE" = "308" ]; then
  echo "=== deploy-session24 SUCCESS ==="
else
  echo "=== deploy-session24 WARNING: unexpected HTTP status $HTTP_CODE ==="
fi
