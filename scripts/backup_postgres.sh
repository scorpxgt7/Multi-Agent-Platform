#!/usr/bin/env bash
set -euo pipefail

# Backup Postgres DB from docker compose service 'postgres'
OUT_DIR=${OUT_DIR:-./backups}
mkdir -p "$OUT_DIR"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILE="$OUT_DIR/postgres-backup-$TIMESTAMP.sql"
COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"

CONTAINER=$(docker compose -f ${COMPOSE_FILES// / -f } ps -q postgres)
if [ -z "$CONTAINER" ]; then
  echo "Postgres container not running" >&2
  exit 2
fi

echo "Creating Postgres backup to $FILE"
docker exec -i "$CONTAINER" pg_dumpall -U "${POSTGRES_USER:-postgres}" > "$FILE"
echo "Backup complete"
