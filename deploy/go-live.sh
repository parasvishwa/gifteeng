#!/usr/bin/env bash
# =============================================================================
#  Gifteeng Go-Live Script
#  Run on the server AFTER DNS A records are pointing to 217.216.59.87
#
#  Steps performed:
#   1. Install Certbot + issue SSL certs
#   2. Deploy updated nginx config (HTTPS, security headers)
#   3. Update NEXT_PUBLIC_API_BASE_URL in .env to use https domain
#   4. Rebuild & restart web + api
#
#  Usage (as root on the server):
#    bash /srv/gifteeng/deploy/go-live.sh
# =============================================================================

set -euo pipefail
log() { echo ""; echo "━━━ $* ━━━"; }

GIFTEENG_DIR="/srv/gifteeng"
ENV_FILE="${GIFTEENG_DIR}/.env"
NGINX_CONF="/etc/nginx/conf.d/gifteeng.conf"

# ── 1. Verify DNS before we start ──────────────────────────────────────────
log "Checking DNS"
for domain in new.gifteeng.com new-business.gifteeng.com new-api.gifteeng.com; do
  ip=$(dig +short "$domain" 2>/dev/null | tail -1)
  if [[ -z "$ip" ]]; then
    echo "  ❌ $domain — NOT RESOLVING. Point DNS first, then re-run." >&2
    exit 1
  fi
  echo "  ✅ $domain → $ip"
done

# ── 2. Install Certbot (skip if already installed) ─────────────────────────
log "Installing Certbot"
if ! command -v certbot &>/dev/null; then
  apt-get update -qq
  apt-get install -y certbot python3-certbot-nginx
else
  echo "  certbot already installed — skipping"
fi

# ── 3. Issue certificates ──────────────────────────────────────────────────
log "Issuing Let's Encrypt certificates"
# certbot will modify nginx config automatically
certbot --nginx \
  -d new.gifteeng.com \
  -d new-business.gifteeng.com \
  -d new-api.gifteeng.com \
  --non-interactive \
  --agree-tos \
  --redirect \
  -m admin@gifteeng.com

echo "  ✅ SSL certificates issued"

# ── 4. Deploy updated nginx config ────────────────────────────────────────
log "Deploying nginx config"
cp "${GIFTEENG_DIR}/deploy/nginx/conf.d/gifteeng.conf" "$NGINX_CONF"
nginx -t && systemctl reload nginx
echo "  ✅ nginx reloaded"

# ── 5. Update NEXT_PUBLIC_API_BASE_URL in .env ────────────────────────────
log "Updating .env"
if grep -q "NEXT_PUBLIC_API_BASE_URL" "$ENV_FILE"; then
  sed -i 's|NEXT_PUBLIC_API_BASE_URL=.*|NEXT_PUBLIC_API_BASE_URL=https://new-api.gifteeng.com|' "$ENV_FILE"
else
  echo 'NEXT_PUBLIC_API_BASE_URL=https://new-api.gifteeng.com' >> "$ENV_FILE"
fi
echo "  ✅ NEXT_PUBLIC_API_BASE_URL=https://new-api.gifteeng.com"

# ── 6. Rebuild & restart ──────────────────────────────────────────────────
log "Rebuilding web app"
cd "$GIFTEENG_DIR"
GIFTEENG_USER="gifteeng"
RUN_AS=("sudo" "-u" "$GIFTEENG_USER" "-H")

# Rebuild API (CORS change in main.ts)
"${RUN_AS[@]}" pnpm --filter @gifteeng/api build
systemctl restart gifteeng-api
echo "  ✅ API rebuilt and restarted"

# Rebuild web (env change + checkout)
"${RUN_AS[@]}" pnpm --filter @gifteeng/web build
systemctl restart gifteeng-web
echo "  ✅ Web rebuilt and restarted"

# ── 7. Health check ───────────────────────────────────────────────────────
log "Health checks"
sleep 4

for endpoint in "https://new-api.gifteeng.com/api/health" "https://new.gifteeng.com"; do
  if curl -fsS -o /dev/null --max-time 10 "$endpoint" 2>/dev/null; then
    echo "  ✅ $endpoint"
  else
    echo "  ⚠️  $endpoint — not responding (services may still be starting)"
  fi
done

# ── 8. Set up certbot auto-renewal ────────────────────────────────────────
log "Certbot auto-renewal"
systemctl enable certbot.timer 2>/dev/null || true
# Add post-deploy hook so nginx reloads after each renewal
mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/bash
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
echo "  ✅ Auto-renewal configured (certs expire in 90 days, auto-renewed at 60)"

echo ""
echo "════════════════════════════════════════════════════════"
echo "  🚀 GIFTEENG IS LIVE!"
echo "════════════════════════════════════════════════════════"
echo "  B2C  → https://new.gifteeng.com"
echo "  B2B  → https://new-business.gifteeng.com"
echo "  API  → https://new-api.gifteeng.com/api/docs"
echo ""
echo "  Logs: journalctl -u gifteeng-api -f"
echo "        journalctl -u gifteeng-web -f"
echo "════════════════════════════════════════════════════════"
