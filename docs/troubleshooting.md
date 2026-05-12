# Troubleshooting

Common issues and first steps:

- Service failing healthcheck: view logs `docker compose logs <service>` and check health endpoint (`/api/health` or service `/health`).
- Postgres connection errors: confirm `DATABASE_URL` in `.env` and that `pgdata` volume exists. Check `docker compose logs postgres`.
- Redis missing data after restart: confirm `redis` container uses persisted volume `redisdata` and that `dump.rdb` exists in `/data` inside container.
- Worker not processing: verify `workflow-worker` container status and `orchestrator-service` health; check worker logs for connection errors to Redis or DB.
- Gateway 401 errors: ensure the `x-api-key` header uses a valid operator API key (bootstrap via `scripts/seed_persistence.sh`).

If in doubt, collect an operational report and share with operators:

```bash
./scripts/deploy_report.sh
cat /tmp/deploy_report.json
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml ps
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml logs --tail 200
```
