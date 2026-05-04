# Deployment Guide

This repo is now structured for a practical split deployment:

- Frontend: GitHub Pages
- Backend: Dockerized Node service on a VPS or server
- Reverse proxy: Nginx

## Target model

- Public frontend URL:
  `https://scorpxgt7.github.io/Multi-Agent-Platform/`
- Backend API URL:
  `https://api.your-domain.example`

The frontend should point its `Backend Endpoint` field to the backend base URL,
for example:

`https://api.your-domain.example`

The backend will expose:

- `/api/health`
- `/api/nexus/run`
- `/api/nexus/runs`
- `/api/maintenance/status`
- `/api/maintenance/run`

## 1. Prepare the server

Install:

- Docker
- Docker Compose plugin
- Nginx
- TLS certificate tooling, typically `certbot`

Copy this repo to the server and move into the project directory.

## 2. Prepare production environment

Use [deploy/env.production.example](D:/Multi-Agent%20Platform/deploy/env.production.example) as the template.

Required values:

- `HOST=0.0.0.0`
- `PORT=8787`
- `PUBLIC_APP_URL=https://scorpxgt7.github.io/Multi-Agent-Platform/`
- `CORS_ALLOWED_ORIGINS=https://scorpxgt7.github.io`
- `NEXUS_API_KEY=<strong-random-secret>`
- `NEXUS_PERSISTENCE_MODE=sqlite`

Recommended:

- `MAINTENANCE_AUTORUN=true`
- `MAINTENANCE_DAILY_UTC=06:00`

## 3. Validate before serving traffic

Run:

```powershell
npm run validate:backend
```

Expected result:

- validation succeeds
- no fatal config errors
- warnings only if they are intentionally accepted

For a strict deployment, do not proceed if:

- `NEXUS_PERSISTENCE_MODE=sqlite` fails validation
- CORS is wildcard with a public frontend
- auth is disabled

## 4. Start the backend container

Option A: use the repo-root compose file directly after adapting the environment.

```powershell
docker compose up -d --build
```

Option B: run with an env file:

```powershell
docker compose --env-file deploy/env.production up -d --build
```

Verify the container:

```powershell
docker compose ps
docker compose logs --tail=100 nexus-backend
```

## 5. Smoke check the backend

Run against the live backend:

```powershell
$env:BACKEND_BASE_URL='http://127.0.0.1:8787'
$env:NEXUS_API_KEY='<your-api-key>'
npm run smoke:backend
```

Expected result:

- `ok: true`
- `authRequired: true`
- `authenticated: true`

## 6. Put Nginx in front

Use [deploy/nginx.api.conf.example](D:/Multi-Agent%20Platform/deploy/nginx.api.conf.example) as the starting point.

That config assumes:

- backend container is reachable at `127.0.0.1:8787`
- public backend hostname is `api.your-domain.example`

After updating the hostname:

1. copy the config into your Nginx sites directory
2. enable the site
3. test the config
4. reload Nginx

Typical flow:

```powershell
nginx -t
systemctl reload nginx
```

Then add TLS for the backend hostname.

## 7. Point the frontend to the backend

In the running frontend:

- set `Backend Endpoint` to `https://api.your-domain.example`
- set `Backend API Key` to your configured API key

Then verify:

- runtime health shows `Auth required: yes`
- runtime health shows `Authenticated: yes`
- maintenance status loads successfully

## 8. Post-deploy checks

Confirm:

1. `/api/health` shows:
   - `authRequired: true`
   - `authenticated: false` without credentials
   - `persistence.mode: sqlite`
2. protected endpoints return `401` without a key
3. protected endpoints succeed with the correct key
4. maintenance review can run manually
5. diagnostics summary records events normally

## 9. Rollback path

If the backend deploy is unhealthy:

1. stop external traffic at Nginx if needed
2. inspect `docker compose logs`
3. rerun `npm run validate:backend` in the deployment environment
4. if SQLite is the blocker and this is an emergency only:
   - temporarily switch `NEXUS_PERSISTENCE_MODE=auto`
   - redeploy
   - treat that as degraded mode, not a final fix

## 10. Production baseline

Call the deployment ready when all of these are true:

1. `NEXUS_API_KEY` is set
2. `CORS_ALLOWED_ORIGINS` is explicit
3. `NEXUS_PERSISTENCE_MODE=sqlite`
4. backend validation passes
5. backend smoke check passes
6. maintenance review runs successfully
7. frontend can authenticate to the backend
