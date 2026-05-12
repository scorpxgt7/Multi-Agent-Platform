#!/usr/bin/env bash
set -euo pipefail

# Rollback remote VPS to the last deployed git commit recorded in .last_deploy
# Usage: DEPLOY_HOST=host DEPLOY_USER=user DEPLOY_PATH=/opt/multi-agent DEPLOY_ENV=production ./deploy/rollback_vps.sh

DEPLOY_HOST=${DEPLOY_HOST:-}
DEPLOY_USER=${DEPLOY_USER:-$(whoami)}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/multi-agent}
DOCKER_CMD=${DOCKER_CMD:-docker}
DEPLOY_ENV=${DEPLOY_ENV:-production}

if [ -z "$DEPLOY_HOST" ]; then
  echo "Please set DEPLOY_HOST" >&2
  exit 2
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "Rolling back ${SSH_TARGET}:${DEPLOY_PATH} (env=${DEPLOY_ENV})"

ssh "$SSH_TARGET" bash -lc "'
set -euo pipefail
DEPLOY_ENV="${DEPLOY_ENV}"
if [ "${DEPLOY_ENV}" = "staging" ]; then
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi
cd '${DEPLOY_PATH}'
if [ ! -f .last_deploy ]; then
  echo 'No .last_deploy file found; cannot rollback' >&2
  exit 2
fi
TARGET_COMMIT=$(cat .last_deploy || true)
if [ -z "$TARGET_COMMIT" ]; then
  echo 'No previous commit recorded; aborting' >&2
  exit 2
fi
git fetch --all --prune
git checkout -f "$TARGET_COMMIT"
sudo ${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } up -d --build
echo "Rolled back to $TARGET_COMMIT"
'"

echo "Rollback complete on ${DEPLOY_HOST}"
