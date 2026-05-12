#!/usr/bin/env bash
set -euo pipefail

# Verify that the seeded organization (created by scripts/seed_persistence.sh) still exists
NGINX_PORT=${NGINX_PORT:-80}
GATEWAY=${GATEWAY:-http://localhost:${NGINX_PORT}/api}
SEED_FILE=${SEED_FILE:-.persistence_seed.json}

if [ ! -f "$SEED_FILE" ]; then
  echo "Seed file $SEED_FILE not found. Run scripts/seed_persistence.sh first." >&2
  exit 2
fi

ORG_ID=$(jq -r '.organization.id' "$SEED_FILE" 2>/dev/null || true)
if [ -z "$ORG_ID" ] || [ "$ORG_ID" = "null" ]; then
  echo "Could not extract organization id from $SEED_FILE" >&2
  exit 2
fi

echo "Verifying organization $ORG_ID exists via $GATEWAY"
RES=$(curl -sS "$GATEWAY/v1/organizations")
echo "$RES" | jq -e --arg id "$ORG_ID" '(.organizations // []) | map(select(.id == $id)) | length > 0' >/dev/null
if [ $? -eq 0 ]; then
  echo "Persistence verified: organization $ORG_ID exists"
  exit 0
else
  echo "Persistence check failed: organization $ORG_ID not found" >&2
  exit 2
fi
