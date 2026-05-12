#!/usr/bin/env bash
set -euo pipefail

# Create a small organization via the gateway and save returned payload for persistence testing
NGINX_PORT=${NGINX_PORT:-80}
GATEWAY=${GATEWAY:-http://localhost:${NGINX_PORT}/api}
OUT_FILE=${OUT_FILE:-.persistence_seed.json}
SUFFIX=$(date +%s)

echo "Seeding persistence test via $GATEWAY"
curl -sS -X POST "$GATEWAY/v1/organizations/bootstrap" -H "Content-Type: application/json" -d \
  "{\"organization_name\": \"persistence-test-$SUFFIX\", \"organization_slug\": \"persistence-test-$SUFFIX\", \"workspace_name\": \"persistence-workspace-$SUFFIX\", \"workspace_slug\": \"persistence-workspace-$SUFFIX\", \"operator_name\": \"Seed Admin\", \"operator_email\": \"seed-admin-$SUFFIX@example.com\"}" > "$OUT_FILE"

echo "Seed written to $OUT_FILE"
cat "$OUT_FILE"
