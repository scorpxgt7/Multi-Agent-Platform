#!/usr/bin/env bash
set -euo pipefail

#!/usr/bin/env bash
set -euo pipefail

# Run the validation-runner service locally via docker compose.
DEPLOY_ENV=${DEPLOY_ENV:-production}
if [ "$DEPLOY_ENV" = "staging" ]; then
	COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.staging.yml"
else
	COMPOSE_FILES="infra/docker-compose.yml infra/docker-compose.prod.yml"
fi

echo "Running validation-runner (this runs integration-style checks against services) for env=$DEPLOY_ENV"
docker compose -f ${COMPOSE_FILES// / -f } run --rm validation-runner
