#!/usr/bin/env bash
# session62 — Live presence (#53) + AI customer-intent targeting (#54)
#
# Backend:
#   • PageViewsService.track() now publishes a one-time "presence" event
#     to the realtime global channel for each NEW session (de-duped via
#     in-memory set, capped at 5000). Payload includes session id,
#     customer id (or null), label, path, device/browser/os.
#   • New module ai-targeting:
#       - AiTargetingService runs every 30 minutes via setInterval
#         (no @nestjs/schedule dep) — pulls last hour of pageView events
#         per logged-in customer, asks the LLM to classify intent +
#         pick an action + write a one-line message, persists to
#         Customer.metadata.aiIntent, fires a push nudge (FCM via
#         NotificationsService.sendToCustomer) when confidence ≥ 0.55.
#       - 24-hour anti-spam cap per customer.
#       - Admin endpoints: POST /admin/ai-targeting/sweep (run now) and
#         POST /admin/ai-targeting/customer/:id (one-off evaluate).
#
# Web admin:
#   • New /super-admin/activity-feed/LivePresenceStrip — top of the
#     activity feed page. Listens to /api/public/events, plays a soft
#     two-tone Web-Audio beep on every new arrival, lists everyone
#     currently on site (web + Flutter) with their name / phone / path /
#     device. Mute toggle persisted to localStorage.
set -euo pipefail
cd /srv/gifteeng
set -a; . /srv/gifteeng/.env; set +a
tar xzf /tmp/patch_session62.tar.gz
pnpm --filter @gifteeng/api build
pnpm --filter @gifteeng/web build
systemctl restart gifteeng-api
sleep 4
systemctl restart gifteeng-web
sleep 3
for i in 1 2 3 4 5; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "  api /health ok"
    break
  fi
  echo "  ... api not ready yet (attempt $i/5)"
  sleep 2
done
echo "DEPLOY_OK session62"
