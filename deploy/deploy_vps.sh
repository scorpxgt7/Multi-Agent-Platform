#!/usr/bin/env bash
set -euo pipefail

# One-command VPS deploy helper.
# Usage: DEPLOY_HOST=host DEPLOY_USER=user DEPLOY_PATH=/srv/multi-agent REPO_URL=git@github.com:owner/repo.git ./deploy/deploy_vps.sh

DEPLOY_HOST=${DEPLOY_HOST:-}
DEPLOY_USER=${DEPLOY_USER:-$(whoami)}
DEPLOY_PATH=${DEPLOY_PATH:-/opt/multi-agent}
REPO_URL=${REPO_URL:-$(git config --get remote.origin.url || echo "")}
DOCKER_CMD=${DOCKER_CMD:-docker}
# DEPLOY_ENV may be 'production' or 'staging'
DEPLOY_ENV=${DEPLOY_ENV:-production}

# Compose files are chosen based on target environment
if [ "$DEPLOY_ENV" = "staging" ]; then
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi

if [ -z "$DEPLOY_HOST" ]; then
  echo "Please set DEPLOY_HOST (e.g. DEPLOY_HOST=1.2.3.4)" >&2
  exit 2
fi

if [ -z "$REPO_URL" ]; then
  echo "Could not determine REPO_URL; set REPO_URL env var." >&2
  exit 2
fi

SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

echo "Deploying to ${SSH_TARGET}:${DEPLOY_PATH} using repo ${REPO_URL} (env=${DEPLOY_ENV})"

ssh "$SSH_TARGET" bash -lc "'
set -euo pipefail
DEPLOY_ENV="${DEPLOY_ENV}"
if [ "${DEPLOY_ENV}" = "staging" ]; then
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
  COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi
mkdir -p '${DEPLOY_PATH}'
cd '${DEPLOY_PATH}'
if [ -d .git ]; then
  PREV_COMMIT=$(git rev-parse --short HEAD || true)
  echo "$PREV_COMMIT" > .last_deploy || true
  git fetch --all --prune
  git reset --hard origin/main
else
  git clone '${REPO_URL}' .
fi
# Ensure .env exists for the target environment
if [ ! -f .env ] && [ -f deploy/env.${DEPLOY_ENV}.example ]; then
  cp deploy/env.${DEPLOY_ENV}.example .env
  echo 'Created .env from template; please edit with production secrets if necessary.'
fi
sudo ${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } pull || true
sudo ${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } up -d --build

# Persist current commit info for auditing / rollback
CUR_COMMIT=$(git rev-parse --short HEAD || true)
echo "$CUR_COMMIT" > .current_deploy || true

# Run validation-runner non-blocking
sudo ${DOCKER_CMD} compose -f ${COMPOSE_FILES// / -f } run --rm validation-runner || true
echo 'Deployment commands executed on remote host.'
'"

echo "Deployment command completed. Check ${DEPLOY_HOST} for runtime status or run scripts/deploy_report.sh"
