# Smoke Check Results

- Date: 2026-05-14T00:00:00Z

## Summary

- Backend: OK
- Frontend: OK (fallback to static build assertions; Edge not found)
- Patch: Updated `scripts/smoke-frontend.mjs` to fall back to build-only checks when Edge isn't installed.

## Backend smoke output

```
{"ok":true,"baseUrl":"http://127.0.0.1:8787","authRequired":false,"authenticated":true,"defaultEngine":"local-simulation","maintenanceScheduler":"disabled"}
```

## Frontend smoke output

```
{"ok":true,"url":"http://127.0.0.1:36633","markers":["Visual Runtime Builder","Deploy AI Workforce Graphs","Compiler Preview","Draft to deploy"],"edgePath":null}
```

## Notes

- The backend server was started in a background terminal to allow smoke checks to run.
- No other source code changes were required besides the `scripts/smoke-frontend.mjs` fallback.
