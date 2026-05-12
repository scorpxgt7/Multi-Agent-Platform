#!/usr/bin/env bash
set -euo pipefail

# Startup helper to run docker compose and perform runtime checks

# Select compose files based on DEPLOY_ENV (production|staging)
DEPLOY_ENV=${DEPLOY_ENV:-production}
if [ "$DEPLOY_ENV" = "staging" ]; then
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi
DOCKER_CMD=${DOCKER_CMD:-docker}

echo "Starting runtime via: ${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } up -d --build (env=${DEPLOY_ENV})"
${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } up -d --build

echo "Waiting for services to be healthy and running startup checks..."
./scripts/startup_checks.sh || {
  echo "startup checks failed" >&2
  exit 2
}

echo "Running validation-runner to validate runtime behavior..."
${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } run --rm validation-runner || true

echo "Collecting deployment report..."
./scripts/deploy_report.sh || true

echo "Runtime start complete."
