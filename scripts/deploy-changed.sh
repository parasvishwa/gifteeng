#!/usr/bin/env bash
# Deploy whatever the current git diff says has changed since the last
# deploy tag. Smart-default for "I made some edits, ship them."
#
# Usage:
#   scripts/deploy-changed.sh <session_name>
#
# Skips files that are gitignored / build artefacts.
# Bails out if the working tree has uncommitted changes (you should
# commit before deploying so the deploy is reproducible).
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/deploy-changed.sh <session_name>"
  exit 2
fi

SESSION="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "❌ Not a git repo — run \`git init\` first, or use scripts/deploy.sh with explicit file list."
  exit 1
fi

# Find the last "deploy-*" tag
LAST_TAG="$(git tag -l 'deploy-*' --sort=-creatordate | head -1)"
if [[ -z "$LAST_TAG" ]]; then
  echo "==> No previous 'deploy-*' tag found. Diffing against HEAD~10 instead."
  BASE="HEAD~10"
else
  echo "==> Diffing against last deploy: $LAST_TAG"
  BASE="$LAST_TAG"
fi

# Collect changed files (added or modified, not deleted)
mapfile -t FILES < <(git diff --name-only --diff-filter=AM "$BASE"...HEAD)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "Nothing has changed since $BASE. Nothing to deploy."
  exit 0
fi

echo "==> Files to deploy:"
printf '    %s\n' "${FILES[@]}"
echo

read -p "Continue? [y/N] " yn
case "$yn" in [Yy]*) ;; *) echo "aborted"; exit 1;; esac

# Hand off to the regular deploy
exec "$ROOT/scripts/deploy.sh" "$SESSION" "${FILES[@]}"
