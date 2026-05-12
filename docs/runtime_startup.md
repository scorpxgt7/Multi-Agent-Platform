# Runtime Startup

This document explains the startup automation and runtime checks used during deploy and local runs.

Key scripts:

- `deploy/start_runtime.sh` — lifts the compose stack (production or staging), runs `startup_checks` and triggers `validation-runner`.
- `scripts/startup_checks.sh` — probes core services (`api-gateway`, `orchestrator-service`, `redis`) and generates `/tmp/deploy_report.json`.
- `scripts/deploy_report.sh` — collects gateway health, diagnostics and audit endpoints into a JSON report.

Best practices:

- Ensure `.env` is present before starting. Use `deploy/bootstrap_env.sh` to create a baseline `.env`.
- Start services with `DEPLOY_ENV` set to `staging` or `production` to select appropriate compose overlays.
- Monitor `docker compose ps` and `docker compose logs -f` for problem diagnosis.

Healthchecks provided in compose files will allow Docker to restart unhealthy containers automatically (restart: unless-stopped) — review `infra/docker-compose.prod.yml` for configured healthchecks.
