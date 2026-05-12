# Quickstart

This quickstart gets the platform running locally for development or a small-scale staging evaluation.

1. Copy environment template and generate secrets:

```bash
./deploy/bootstrap_env.sh
# Edit .env to set production values for staging/prod
```

2. Start the runtime (default: production overlay)

```bash
# For production-like local run
DEPLOY_ENV=production ./deploy/start_runtime.sh

# For staging overlay
DEPLOY_ENV=staging ./deploy/start_runtime.sh
```

3. Run lightweight validation (in container):

```bash
./scripts/run_validation.sh
```

4. Open the frontend (if running behind `infra/nginx`) at the host/port defined in `.env`.

5. Inspect diagnostics: open the app header "View diagnostics" or call the gateway diagnostics API:

```bash
curl http://localhost:8787/api/v1/diagnostics
curl http://localhost:8787/api/v1/deployment/audit
```

Notes:
- Use `scripts/seed_persistence.sh` and `scripts/verify_persistence.sh` to perform persistence checks.
- Use `scripts/validate_restart_recovery.sh` and `scripts/validate_queue_recovery.sh` to validate restart behavior.
