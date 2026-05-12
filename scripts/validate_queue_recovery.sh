#!/usr/bin/env bash
set -euo pipefail

# Scaffolding script to validate queue recovery across worker restart.
# This script attempts to:
#  - ensure a valid admin API key (from .persistence_seed.json or $ADMIN_API_KEY)
#  - create a minimal team if none exists
#  - enqueue a lightweight workflow
#  - stop the workflow worker
#  - start the workflow worker
#  - poll queue status until the item completes

NGINX_PORT=${NGINX_PORT:-80}
GATEWAY=${GATEWAY:-http://localhost:${NGINX_PORT}/api}
DEPLOY_ENV=${DEPLOY_ENV:-production}
ADMIN_API_KEY=${ADMIN_API_KEY:-}

if [ "$DEPLOY_ENV" = "staging" ]; then
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi

if [ -z "$ADMIN_API_KEY" ] && [ -f .persistence_seed.json ]; then
  ADMIN_API_KEY=$(jq -r '.api_key' .persistence_seed.json 2>/dev/null || true)
fi

if [ -z "$ADMIN_API_KEY" ]; then
  echo "No ADMIN_API_KEY found. Run scripts/seed_persistence.sh or set ADMIN_API_KEY env var." >&2
  exit 2
fi

echo "Using gateway: $GATEWAY"

# Find or create a team
TEAM_ID=${TEAM_ID:-}
if [ -z "$TEAM_ID" ]; then
  echo "Listing teams..."
  TEAMS_JSON=$(curl -sS -H "x-api-key: $ADMIN_API_KEY" "$GATEWAY/v1/teams" || true)
  TEAM_ID=$(echo "$TEAMS_JSON" | jq -r '.teams[0].id' 2>/dev/null || true)
fi

if [ -z "$TEAM_ID" ] || [ "$TEAM_ID" = "null" ]; then
  echo "No team found; creating a minimal team"
  CREATE_RESP=$(curl -sS -X POST -H "x-api-key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d '{"name":"queue-test-team","description":"queue test","governance_config":{},"agent_ids":[]}' "$GATEWAY/v1/teams")
  TEAM_ID=$(echo "$CREATE_RESP" | jq -r '.team.id' 2>/dev/null || true)
fi

if [ -z "$TEAM_ID" ] || [ "$TEAM_ID" = "null" ]; then
  echo "Failed to obtain or create a team. Aborting." >&2
  exit 2
fi

echo "Using TEAM_ID=$TEAM_ID"

# Enqueue a workflow
ENQUEUE_BODY=$(cat <<JSON
{"team_id":"$TEAM_ID","task":"Queue recovery test","actor_id":"system","subsystem":"admin","context":{},"short_term_memory":[],"priority":5,"max_retries":1}
JSON
)

ENQUEUE_RESP=$(curl -sS -X POST -H "x-api-key: $ADMIN_API_KEY" -H "Content-Type: application/json" -d "$ENQUEUE_BODY" "$GATEWAY/v1/workflows/enqueue")
REQUEST_ID=$(echo "$ENQUEUE_RESP" | jq -r '.request_id' 2>/dev/null || true)

if [ -z "$REQUEST_ID" ] || [ "$REQUEST_ID" = "null" ]; then
  echo "Failed to enqueue workflow. Response:" >&2
  echo "$ENQUEUE_RESP"
  exit 2
fi

echo "Enqueued request_id=$REQUEST_ID"

# stop worker
echo "Stopping workflow worker container..."
docker compose -f ${COMPOSE_FILES// / -f } stop workflow-worker || true
sleep 2
echo "Starting workflow worker..."
docker compose -f ${COMPOSE_FILES// / -f } start workflow-worker || docker compose -f ${COMPOSE_FILES// / -f } up -d --no-recreate workflow-worker

# Poll queue status
echo "Polling queue status for completion..."
for i in $(seq 1 60); do
  sleep 2
  STATUS_RESP=$(curl -sS -H "x-api-key: $ADMIN_API_KEY" "$GATEWAY/v1/workflows/queue/status" || true)
  ITEM=$(echo "$STATUS_RESP" | jq -c --arg id "$REQUEST_ID" '.queue.items[]? | select(.request_id == $id)' 2>/dev/null || true)
  if [ -n "$ITEM" ]; then
    STATE=$(echo "$ITEM" | jq -r '.status' 2>/dev/null || true)
    echo "Queue item status: $STATE"
    if [ "$STATE" = "completed" ] || [ "$STATE" = "failed" ] || [ "$STATE" = "cancelled" ] || [ "$STATE" = "dead_letter" ]; then
      echo "Queue processing finished with status: $STATE"
      exit 0
    fi
  fi
done

echo "Timed out waiting for queue item to complete" >&2
exit 2
