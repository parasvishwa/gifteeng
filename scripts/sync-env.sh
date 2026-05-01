#!/usr/bin/env bash
# Pull the master .env from the VPS to a local .env (overwrite-safe).
#
# Usage: scripts/sync-env.sh
#
# Saves the file with mode 0600 so it stays out of casual `cat` views.
# Never run this on a public laptop.
set -euo pipefail
VPS="${VPS:-217.216.59.87}"
USER="${USER:-root}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$ROOT/.env" ]]; then
  read -p "Local .env exists. Overwrite? [y/N] " yn
  case "$yn" in [Yy]*) ;; *) echo "aborted"; exit 1;; esac
fi

scp -o ConnectTimeout=10 "$USER@$VPS:/srv/gifteeng/.env" "$ROOT/.env"
chmod 600 "$ROOT/.env"
echo "✅ Pulled .env from $VPS to $ROOT/.env (mode 600)"
echo
echo "Reminder: .env is gitignored. NEVER paste it in chat / email / Slack."
