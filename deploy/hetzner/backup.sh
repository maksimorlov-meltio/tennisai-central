#!/usr/bin/env bash
# Nightly database dump. The database now lives on the same disk as the app, so
# nothing else is keeping a copy — this script is the whole safety net.
#
# Installed by setup-backup.sh as a daily cron job; can also be run by hand:
#   bash /opt/tennisai/deploy/hetzner/backup.sh
set -euo pipefail

cd "$(dirname "$0")"
DEST="/opt/tennisai/backups"
KEEP=14

mkdir -p "$DEST"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$DEST/tennisai_${STAMP}.sql.gz"

docker compose exec -T db pg_dump -U tennisai tennisai | gzip > "$FILE"
echo "wrote $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the most recent $KEEP, delete the rest.
ls -1t "$DEST"/tennisai_*.sql.gz | tail -n +$((KEEP + 1)) | xargs -r rm --
