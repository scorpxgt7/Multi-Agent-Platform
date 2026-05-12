#!/usr/bin/env bash
set -euo pipefail

# Validate that a full stop/start of the compose stack recovers services and preserves state
DEPLOY_ENV=${DEPLOY_ENV:-production}
if [ "$DEPLOY_ENV" = "staging" ]; then
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi

echo "Bringing stack down"
docker compose -f ${COMPOSE_FILES// / -f } down

echo "Bringing stack up"
docker compose -f ${COMPOSE_FILES// / -f } up -d --build

echo "Running startup checks"
./scripts/startup_checks.sh || { echo "startup checks failed" >&2; exit 2; }

echo "Running validation-runner for sanity tests"
docker compose -f ${COMPOSE_FILES// / -f } run --rm validation-runner || { echo "validation-runner detected failures (non-zero)"; exit 2; }

echo "Restart recovery validation succeeded"
