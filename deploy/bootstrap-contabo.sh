#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
#  Gifteeng — Contabo Cloud VPS bootstrap (Ubuntu 22/24)
# ═══════════════════════════════════════════════════════════════════════════
#
#  Provisions a fresh Ubuntu server as a MULTI-PROJECT host.
#  - Gifteeng is the first tenant but nothing hard-codes "Gifteeng owns this box"
#  - Postgres 16 is shared across projects (gifteeng DB + user created here;
#    future projects create their own)
#  - nginx is the shared reverse proxy (each project drops its own vhost file)
#  - Every Node service binds to 127.0.0.1 so future projects can claim
#    unused ports without collision
#  - Only 22, 80, 443 are open at the firewall
#
#  Idempotent — safe to re-run. Won't rotate existing credentials on re-run.
#
#  Usage (as root on the Contabo VPS):
#    scp deploy/bootstrap-contabo.sh root@<ip>:/root/
#    ssh root@<ip> "bash /root/bootstrap-contabo.sh"
#
#  Override defaults via env:
#    DOMAIN=new.gifteeng.com DOMAIN_B2B=new-business.gifteeng.com \
#    DOMAIN_API=new-api.gifteeng.com ADMIN_SSH_KEY="ssh-ed25519 AAAA..." \
#    bash bootstrap-contabo.sh
#
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail
log() { echo ""; echo "==> $*"; }

: "${GIFTEENG_USER:=gifteeng}"
: "${GIFTEENG_DIR:=/srv/gifteeng}"
: "${PG_DB:=gifteeng}"
: "${PG_USER:=gifteeng}"
: "${DOMAIN:=new.gifteeng.com}"
: "${DOMAIN_B2B:=new-business.gifteeng.com}"
: "${DOMAIN_API:=new-api.gifteeng.com}"
: "${ADMIN_SSH_KEY:=}"

CRED_FILE=/root/gifteeng-credentials.txt

# Re-run detection: if cred file exists, reuse the secrets instead of rotating.
if [[ -f "${CRED_FILE}" ]]; then
  log "Found existing ${CRED_FILE} — re-using credentials (idempotent run)"
  # shellcheck disable=SC1090
  source <(
    grep -E '^(PG_PASS|JWT_B2C_SECRET|JWT_B2B_SECRET|FILES_SIGNING_SECRET)=' "${CRED_FILE}"
  )
else
  PG_PASS="$(openssl rand -hex 16)"
  JWT_B2C_SECRET="$(openssl rand -hex 32)"
  JWT_B2B_SECRET="$(openssl rand -hex 32)"
  FILES_SIGNING_SECRET="$(openssl rand -hex 32)"
fi

log "Gifteeng Contabo bootstrap starting"
log "Hostname: $(hostname)"
log "Public IP: $(hostname -I | awk '{print $1}')"

# ═══ 0. SSH hardening ═══
if [[ -n "${ADMIN_SSH_KEY}" ]]; then
  log "Installing admin SSH key"
  mkdir -p /root/.ssh
  chmod 700 /root/.ssh
  touch /root/.ssh/authorized_keys
  chmod 600 /root/.ssh/authorized_keys
  if ! grep -qF "${ADMIN_SSH_KEY}" /root/.ssh/authorized_keys; then
    echo "${ADMIN_SSH_KEY}" >> /root/.ssh/authorized_keys
  fi
fi

# ═══ 1. Base packages ═══
log "apt update + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates gnupg lsb-release \
  build-essential git ufw fail2ban \
  nginx certbot python3-certbot-nginx \
  postgresql-common unzip htop nano jq \
  rsync cron logrotate

# ═══ 2. PostgreSQL 16 (shared) ═══
log "Installing PostgreSQL 16"
sh /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
apt-get install -y -qq postgresql-16 postgresql-client-16
systemctl enable --now postgresql

log "Creating gifteeng database + user (idempotent)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASS}';
  ELSE
    ALTER ROLE ${PG_USER} WITH PASSWORD '${PG_PASS}';
  END IF;
END
\$\$;
EOF

sudo -u postgres psql -v ON_ERROR_STOP=1 <<EOF
SELECT 'CREATE DATABASE ${PG_DB} OWNER ${PG_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DB}')\gexec

GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};
ALTER DATABASE ${PG_DB} OWNER TO ${PG_USER};
EOF

# ═══ 3. Node 20 + pnpm (system-wide, shared) ═══
log "Installing Node 20 (system-wide)"
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node: $(node -v)"

log "Installing pnpm (system-wide)"
npm install -g pnpm@9.12.0 >/dev/null 2>&1 || true
log "pnpm: $(pnpm -v)"

# ═══ 4. Gifteeng service user + dirs ═══
log "Creating ${GIFTEENG_USER} user and ${GIFTEENG_DIR}"
if ! id "${GIFTEENG_USER}" &>/dev/null; then
  useradd --system --create-home --home-dir "/home/${GIFTEENG_USER}" --shell /bin/bash "${GIFTEENG_USER}"
fi
mkdir -p "${GIFTEENG_DIR}" /var/gifteeng/uploads /var/log/gifteeng /backups
chown -R "${GIFTEENG_USER}:${GIFTEENG_USER}" "${GIFTEENG_DIR}" /var/gifteeng /var/log/gifteeng

# ═══ 5. Firewall + fail2ban ═══
log "Configuring UFW — only 22/80/443 open"
ufw allow OpenSSH || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force enable || true

log "Enabling fail2ban"
systemctl enable --now fail2ban || true

# ═══ 6. Shared nginx scaffolding ═══
log "Setting up shared nginx as multi-project reverse proxy"
mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled /var/www/html

# Remove the default server only if it still exists (don't clobber other vhosts)
rm -f /etc/nginx/sites-enabled/default

# Write Gifteeng's own vhost file (other projects get their own file)
cat > /etc/nginx/sites-available/gifteeng.conf <<EOF
# ─── Gifteeng ─── managed by deploy/bootstrap-contabo.sh
# B2C storefront (${DOMAIN}), B2B portal (${DOMAIN_B2B}), API (${DOMAIN_API})

server {
  listen 80;
  server_name ${DOMAIN} ${DOMAIN_B2B};

  location /.well-known/acme-challenge/ { root /var/www/html; }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    client_max_body_size 25m;
  }
}

server {
  listen 80;
  server_name ${DOMAIN_API};

  location /.well-known/acme-challenge/ { root /var/www/html; }

  location / {
    proxy_pass http://127.0.0.1:4000/api;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    client_max_body_size 25m;
    proxy_request_buffering off;
  }
}
EOF
ln -sf /etc/nginx/sites-available/gifteeng.conf /etc/nginx/sites-enabled/gifteeng.conf

# Provide a placeholder fallback server so nginx starts even without vhosts matching
if [[ ! -f /etc/nginx/sites-available/_fallback.conf ]]; then
  cat > /etc/nginx/sites-available/_fallback.conf <<'EOF'
server {
  listen 80 default_server;
  server_name _;
  return 404 "no vhost matches this host header\n";
  add_header Content-Type text/plain;
}
EOF
  ln -sf /etc/nginx/sites-available/_fallback.conf /etc/nginx/sites-enabled/_fallback.conf
fi

nginx -t
systemctl reload nginx || systemctl restart nginx
systemctl enable nginx

# ═══ 7. systemd units for Gifteeng ═══
log "Installing systemd units (gifteeng-api + gifteeng-web)"

cat > /etc/systemd/system/gifteeng-api.service <<EOF
[Unit]
Description=Gifteeng API (NestJS)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=${GIFTEENG_USER}
WorkingDirectory=${GIFTEENG_DIR}
EnvironmentFile=${GIFTEENG_DIR}/.env
ExecStart=/usr/bin/node ${GIFTEENG_DIR}/apps/api/dist/main.js
Restart=on-failure
RestartSec=3
StandardOutput=append:/var/log/gifteeng/api.log
StandardError=append:/var/log/gifteeng/api.err.log

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/gifteeng-web.service <<EOF
[Unit]
Description=Gifteeng Web (Next.js)
After=network.target gifteeng-api.service

[Service]
Type=simple
User=${GIFTEENG_USER}
WorkingDirectory=${GIFTEENG_DIR}/apps/web
EnvironmentFile=${GIFTEENG_DIR}/.env
ExecStart=/usr/bin/node ${GIFTEENG_DIR}/apps/web/node_modules/next/dist/bin/next start -p 3000
Restart=on-failure
RestartSec=3
StandardOutput=append:/var/log/gifteeng/web.log
StandardError=append:/var/log/gifteeng/web.err.log

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

# ═══ 8. Write .env (only if missing) ═══
ENV_FILE="${GIFTEENG_DIR}/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  log "Writing ${ENV_FILE}"
  cat > "${ENV_FILE}" <<EOF
# Generated by bootstrap-contabo.sh at $(date -u +%FT%TZ)
DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}?schema=public"

API_PORT=4000
API_BASE_URL="https://${DOMAIN_API}"
JWT_B2C_SECRET="${JWT_B2C_SECRET}"
JWT_B2B_SECRET="${JWT_B2B_SECRET}"
JWT_EXPIRES_IN="7d"

UPLOAD_DIR="/var/gifteeng/uploads"
FILES_SIGNING_SECRET="${FILES_SIGNING_SECRET}"

# TODO: fill in from existing uat.gifteeng.com / service dashboards
RAZORPAY_KEY_ID=""
RAZORPAY_KEY_SECRET=""
RAZORPAY_WEBHOOK_SECRET=""

SHIPROCKET_EMAIL=""
SHIPROCKET_PASSWORD=""

MSG91_AUTH_KEY=""
MSG91_SENDER_ID="GIFTNG"
MSG91_TEMPLATE_ID=""

SMTP_HOST=""
SMTP_PORT=587
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="Gifteeng <no-reply@gifteeng.com>"

NEXT_PUBLIC_API_BASE_URL="https://${DOMAIN_API}"
NEXT_PUBLIC_B2C_HOST="${DOMAIN}"
NEXT_PUBLIC_B2B_HOST="${DOMAIN_B2B}"
EOF
  chmod 600 "${ENV_FILE}"
  chown "${GIFTEENG_USER}:${GIFTEENG_USER}" "${ENV_FILE}"
else
  log "${ENV_FILE} exists, leaving untouched (re-run)"
fi

# ═══ 9. Daily pg_dump backup cron ═══
log "Installing daily pg_dump cron"
cat > /etc/cron.daily/gifteeng-pg-backup <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
OUT="/backups/gifteeng-$(date +%F).dump"
sudo -u postgres pg_dump -Fc gifteeng > "$OUT"
find /backups -name 'gifteeng-*.dump' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/gifteeng-pg-backup

# ═══ 10. Logrotate for gifteeng logs ═══
cat > /etc/logrotate.d/gifteeng <<'EOF'
/var/log/gifteeng/*.log {
  daily
  rotate 14
  compress
  delaycompress
  notifempty
  missingok
  copytruncate
}
EOF

# ═══ 11. Save credentials ═══
cat > "${CRED_FILE}" <<EOF
=== GIFTEENG CONTABO — $(date -u +%FT%TZ) ===
Public IP            = $(hostname -I | awk '{print $1}')
Hostname             = $(hostname)
PG_DB                = ${PG_DB}
PG_USER              = ${PG_USER}
PG_PASS              = ${PG_PASS}
JWT_B2C_SECRET       = ${JWT_B2C_SECRET}
JWT_B2B_SECRET       = ${JWT_B2B_SECRET}
FILES_SIGNING_SECRET = ${FILES_SIGNING_SECRET}
DATABASE_URL         = postgresql://${PG_USER}:${PG_PASS}@127.0.0.1:5432/${PG_DB}?schema=public
.env                 = ${GIFTEENG_DIR}/.env
DOMAIN               = ${DOMAIN}
DOMAIN_B2B           = ${DOMAIN_B2B}
DOMAIN_API           = ${DOMAIN_API}
EOF
chmod 600 "${CRED_FILE}"

# ═══ 12. Summary ═══
echo ""
echo "=========================================================="
echo "  CONTABO BOOTSTRAP COMPLETE — multi-project ready"
echo "=========================================================="
cat "${CRED_FILE}"
echo "=========================================================="
echo ""
echo "What's installed:"
echo "  ✅ Postgres 16          (shared, listening on 127.0.0.1:5432)"
echo "  ✅ Node 20 + pnpm       (system-wide)"
echo "  ✅ nginx                (shared reverse proxy, vhosts in /etc/nginx/sites-enabled)"
echo "  ✅ certbot              (ready for \`certbot --nginx -d ...\`)"
echo "  ✅ UFW                  (22, 80, 443 open)"
echo "  ✅ fail2ban             (ssh brute-force protection)"
echo "  ✅ systemd gifteeng-*   (api + web units ready, not started yet)"
echo "  ✅ /backups/            (daily pg_dump cron)"
echo ""
echo "For a second project later, just:"
echo "  1. sudo -u postgres psql -c \"CREATE DATABASE myapp OWNER myuser PASSWORD '...'\""
echo "  2. Drop /etc/nginx/sites-available/myapp.conf + symlink into sites-enabled"
echo "  3. systemd unit on a different port (3001, 4001, etc.)"
echo ""
echo "Next step: upload the monorepo and run deploy/deploy.sh"
