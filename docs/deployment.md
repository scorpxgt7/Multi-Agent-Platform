# Deployment Flow

Overview of the one-command VPS deployment flow and CI/CD scaffolding.

1. Prepare the target VPS

- Ensure Docker and Docker Compose (v2) are installed.
- Create the target deploy path (default `/opt/multi-agent`) and give the deploy user appropriate permissions.
- Copy a `.env` file to the target path (use `deploy/env.production.example` as the template).

2. One-command deploy (manual)

```bash
DEPLOY_HOST=1.2.3.4 DEPLOY_USER=ubuntu DEPLOY_PATH=/opt/multi-agent REPO_URL=git@github.com:owner/Multi-Agent-Platform.git ./deploy/deploy_vps.sh
```

The script will clone or `git pull`, copy the env template if missing, pull images, and start `docker compose` using either the production or staging overlays depending on `DEPLOY_ENV`.

3. CI/CD (GitHub Actions)

- `/.github/workflows/deploy.yml` is a production scaffold that builds the frontend with `VITE_DEPLOY_ENV=production` and triggers the SSH deploy action.
- `/.github/workflows/deploy-staging.yml` provides staging deployment.
- Configure repository secrets for SSH deploy and the target folder in your environment settings.

4. Post-deploy validation

- The remote deploy writes `.current_deploy` and `.last_deploy` for auditing and rollback.
- Run `./scripts/deploy_report.sh` locally against the gateway host to gather diagnostics and audit events.
- Validation-runner runs integration checks; review its output in deploy logs.
