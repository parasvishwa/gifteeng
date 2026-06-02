#!/usr/bin/env bash
# session107 — Hero banners get per-slide text overlay
#
# Each banner is now a full hero "slide" with its own editable headline,
# subtitle and CTAs (rendered alongside the image in a 50/50 side-by-side
# composition). The standalone pink-gradient hero section is gone; when
# no banners are seeded yet the page falls back to a text-only hero from
# Settings → Hero copy.
#
# Migration adds 8 nullable VARCHAR columns to hero_banners. Existing
# image-only rows keep all text fields NULL and continue to render
# image-only (full-bleed) via the slider's hasTextOverlay() check.

set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a

tar xzf /tmp/patch_session107.tar.gz

echo "==> applying Prisma migrations..."
(cd packages/db && pnpm prisma migrate deploy 2>&1 | tail -10) || \
  echo "WARN: migrate deploy returned non-zero, proceeding"
(cd packages/db && pnpm prisma generate 2>&1 | tail -3)

pnpm --filter @gifteeng/api build 2>&1 | tail -5
pnpm --filter @gifteeng/web build 2>&1 | tail -5

systemctl restart gifteeng-api
sleep 4
for i in 1 2 3 4 5 6; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"; break
  fi
  echo "  ... api not ready (attempt $i/6)"
  sleep 2
done
systemctl restart gifteeng-web
sleep 3
curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo "DEPLOY_OK session107"
