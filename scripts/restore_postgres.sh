#!/usr/bin/env bash
set -euo pipefail

# Restore Postgres backup to running postgres container
FILE=${1:-}
if [ -z "$FILE" ]; then
  echo "Usage: $0 <backup-file.sql>" >&2
  exit 2
fi

COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
CONTAINER=$(docker compose -f ${COMPOSE_FILES// / -f } ps -q postgres)
if [ -z "$CONTAINER" ]; then
  echo "Postgres container not running" >&2
  exit 2
fi

echo "Restoring $FILE into postgres container $CONTAINER"
cat "$FILE" | docker exec -i "$CONTAINER" psql -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-multi_agent}"
echo "Restore complete"
