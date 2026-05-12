#!/usr/bin/env bash
set -euo pipefail

# Restore a Redis RDB file into the redis container
FILE=${1:-}
if [ -z "$FILE" ]; then
  echo "Usage: $0 <redis-backup.rdb>" >&2
  exit 2
fi

COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
CONTAINER=$(docker compose -f ${COMPOSE_FILES// / -f } ps -q redis)
if [ -z "$CONTAINER" ]; then
  echo "Redis container not running" >&2
  exit 2
fi

echo "Stopping redis container $CONTAINER"
docker stop "$CONTAINER"
echo "Copying $FILE into container:/data/dump.rdb"
docker cp "$FILE" "$CONTAINER":/data/dump.rdb
echo "Starting redis container $CONTAINER"
docker start "$CONTAINER"
echo "Restore requested; monitor redis logs for any errors"
