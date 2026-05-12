#!/usr/bin/env bash
set -euo pipefail

# Backup Redis RDB from container
OUT_DIR=${OUT_DIR:-./backups}
mkdir -p "$OUT_DIR"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
FILE="$OUT_DIR/redis-backup-$TIMESTAMP.rdb"
COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"

CONTAINER=$(docker compose -f ${COMPOSE_FILES// / -f } ps -q redis)
if [ -z "$CONTAINER" ]; then
  echo "Redis container not running" >&2
  exit 2
fi

echo "Triggering Redis RDB save..."
docker exec "$CONTAINER" redis-cli save
echo "Copying RDB to $FILE"
docker cp "$CONTAINER":/data/dump.rdb "$FILE"
echo "Backup complete"
