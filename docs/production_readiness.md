# Production Readiness Checklist

The platform is an integrated alpha/pre-production MVP. Do not deploy it with real sensitive data until every item below passes in the target environment.

## Required gates

1. Current commit validation passes: `./scripts/validate_current_commit.sh`.
2. Nginx config validation passes: `./scripts/validate_nginx_config.sh`.
3. No placeholder secrets remain in `.env`.
4. `NEXUS_API_KEY`, `BOOTSTRAP_TOKEN`, and `INTERNAL_AUTH_SECRET` are strong random values.
5. `CORS_ALLOWED_ORIGINS` is an explicit allowlist.
6. Internal service authentication is enabled and tested.
7. Memory APIs require organization scope and internal authentication.
8. Audit and execution-detail payloads are redacted.
9. Queue retry, cancel, dead-letter, and restart recovery checks pass.
10. Postgres and Redis backup/restore checks pass.
11. Load and failure-injection reports are attached to the release record.

## Recommended validation commands

```bash
./deploy/bootstrap_env.sh
./scripts/validate_current_commit.sh
./scripts/validate_nginx_config.sh
./scripts/validate_queue_recovery.sh
./scripts/validate_restart_recovery.sh
```

## Current maturity

This codebase includes a React app, a Node backend adapter, a FastAPI microservice stack, workflow deployment/queueing, and monitoring scaffolding. It remains pre-production until all gates above are satisfied.
