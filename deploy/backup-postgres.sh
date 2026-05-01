#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Gifteeng Postgres backup
#   - Dumps the database in custom (Fc) format to /backups
#   - Retains the 14 most recent dumps
# Cron example (daily at 03:15):
#   15 3 * * *  /srv/gifteeng/deploy/backup-postgres.sh >> /var/log/gifteeng-backup.log 2>&1
# -----------------------------------------------------------------------------
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION="${RETENTION:-14}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ -f /srv/gifteeng/.env ]]; then
    # shellcheck disable=SC1091
    set -a; source /srv/gifteeng/.env; set +a
  fi
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup-postgres] ERROR: DATABASE_URL is not set" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%F)"
OUT="$BACKUP_DIR/gifteeng-${STAMP}.dump"

echo "[backup-postgres] $(date -Iseconds) dumping to $OUT"
pg_dump -Fc "$DATABASE_URL" > "$OUT"
echo "[backup-postgres] dump complete: $(du -h "$OUT" | cut -f1)"

# Retain only the N most recent dumps
cd "$BACKUP_DIR"
ls -1t gifteeng-*.dump 2>/dev/null | tail -n +$((RETENTION + 1)) | while read -r old; do
  echo "[backup-postgres] pruning $old"
  rm -f -- "$old"
done

echo "[backup-postgres] done"
