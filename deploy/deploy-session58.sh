#!/usr/bin/env bash
# session58 — Web home cleanup (#49)
#
# Web b2c:
#   • CategoryTabBar — icon-on-top + 2-line full label (was first-word
#     pills causing "Key" to appear twice). Top-level categories only,
#     deduped by name.
#   • HeroSearch placeholder text-left to override parent text-center.
#   • AppStoreBadges — new "Also available on" Play / App Store strip
#     under the hero CTAs. URLs come from marketing_config; hidden when
#     both URLs are blank.
#
# Marketing admin:
#   • New fields playStoreUrl + appStoreUrl in /super-admin/marketing.
set -euo pipefail

cd /srv/gifteeng
set -a
. /srv/gifteeng/.env
set +a

tar xzf /tmp/patch_session58.tar.gz

pnpm --filter @gifteeng/web build

systemctl restart gifteeng-web
sleep 3

curl -fsS -o /dev/null -w 'web HTTP %{http_code}\n' http://127.0.0.1:3000/

echo
echo "DEPLOY_OK session58"
