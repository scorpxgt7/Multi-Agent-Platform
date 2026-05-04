# Multi-Agent Platform

Phase 1 of a multi-agent orchestration workspace. The repo now has a runnable
React app scaffold and a canonical platform shell that works without any
external model provider.

## Current structure

- `index.html`
  Root bootstrap page for local development and legacy GitHub Pages root hosting.
- `app.html`
  Dedicated Vite build entry that compiles the React app into deployable HTML.
- `assets/`
  Committed public bundle used by the live GitHub Pages site.
- `src/features/nexus/NexusAgentPlatform.jsx`
  Canonical platform shell used by the app.
- `src/features/nexus/runtime/localRuntime.js`
  Local runtime used in Phase 2 as the provider boundary starter.
- `src/features/nexus/data.js`
  Shared agent defaults, statuses, colors, and task presets.
- `nexus-agent-platform.jsx`
  Compatibility re-export for the canonical platform.
- `multi_agent_automation_platform.jsx`
  Alternate UI/reference artifact.
- `src/App.jsx`
  Runtime app entry that mounts the modular canonical platform.
- `SKILL.md`
  Local project guidance for future platform work.

## Run locally

1. Install dependencies:
   `npm install`
2. Start the dev server:
   `npm run dev`
3. Start the backend adapter:
   `npm run backend`
4. Build for production:
   `npm run build`

## Phase 3 notes

- No external API is required to run the current app.
- The manager, supervisor, and specialist flow is simulated locally so the UI
  and orchestration structure can be validated before backend integration.
- The orchestration shell and runtime are split so a backend provider adapter
  can replace the local runtime without rewriting the UI.
- Runtime mode and recent sessions are persisted locally.
- A backend adapter entrypoint now exists at `/api/nexus/run`. A future backend
  should return a JSON payload containing `entries`, `statuses`, and
  `finalOutput`.

## Phase 4 notes

- `backend/server.js` now provides `GET /api/health` and `POST /api/nexus/run`.
- In backend mode, the frontend calls the adapter through Vite's `/api` proxy in
  development.
- The backend currently uses the same orchestration logic as the local runtime,
  but it already matches the contract needed for a future model-backed service.
- Backend routes now return structured JSON errors with stable codes and
  validation details so the frontend can handle failures consistently.

## GitHub Pages

- The public site now assumes one production path only: legacy GitHub Pages
  branch deployment from `main /`.
- The repository root `index.html` loads the root-level `assets/app.js` and
  `assets/app.css` bundle directly for the live site.
- `npm run build` now refreshes the root-level public assets from `dist/assets`
  so the committed Pages bundle stays aligned with the main build output.
- The GitHub Actions workflow is now build verification only. It no longer
  pretends to be the deployment source while the repository is still using
  legacy Pages mode.
- The public Pages site is local-first by design. Backend runtime controls are
  only exposed when `/api/health` is reachable from the current host.

## Phase 5 notes

- The backend now prefers SQLite persistence through `backend/sqlite_bridge.py`
  and stores data in `backend/data/nexus-runs.db`.
- Legacy JSON run history is migrated into SQLite on first bridge use.
- If the SQLite bridge is unavailable, the backend falls back to the existing
  JSON store instead of failing the entire app.
- `GET /api/nexus/runs` exposes saved backend runs for the frontend session list.
- Backend mode now has both execution and durable persisted history, rather than
  relying only on browser-local session storage.

## Agent roles

- The five-agent structure remains stable for compatibility.
- Each role now includes an advanced skill stack and expected deliverable.
- Those skill profiles are visible in the UI and are used in runtime-generated
  plans, directives, and specialist outputs.

## Workflow modes

- The task intake now exposes first-class workflow presets for discovery,
  operations, product planning, content operations, and QA review.
- The UI also surfaces run metadata such as runtime, engine, duration, artifact
  count, and failure state so operators can inspect runs without opening raw
  logs first.

## Rerun and comparison controls

- Operators can reopen saved sessions and rerun the current task context from
  the active workspace state.
- The sidebar now compares the active run against another saved run to show
  changes in runtime, engine, duration, artifact count, and output footprint.

## Backend run inspection

- Backend runs now persist richer artifacts, including per-agent outputs.
- `GET /api/nexus/runs/:id` returns full run detail for reopening saved backend
  executions.
- The frontend can reopen backend runs with logs, final output, and artifact
  previews instead of only showing shallow session summaries.

## Backend engine abstraction

- The backend no longer calls the orchestration runtime directly from the route.
- `backend/engines/` now owns execution engine selection behind a stable API.
- `GET /api/health` returns the configured default engine and the available
  backend engines.
- The frontend surfaces runtime health so backend mode reports which execution
  engine is active.
- Operators can now choose the active engine from the UI and keep a lightweight
  approval gate enabled before dispatching runs.
- An optional `ollama` engine now works through Ollama's local OpenAI-compatible
  endpoint on `http://127.0.0.1:11434/v1`.
- Configure the local AI engine with `OLLAMA_MODEL` and optionally
  `OLLAMA_BASE_URL` before starting `npm run backend`.

## Hosted backend split

- The static frontend can now target either the same-origin `/api` adapter or a
  separately hosted backend URL entered in the UI.
- Backend mode stays optional; the public Pages site remains useful in local
  simulation mode even when no backend is connected.
- For a real deployment split, host the frontend statically and run the Node
  backend separately with `HOST`, `PORT`, and optional Ollama environment
  variables from `backend/.env.example`.
- Set `CORS_ALLOWED_ORIGINS` to an explicit allowlist before public deployment.
- `GET /api/health` now reports deployment diagnostics such as host, port,
  persistence mode, uptime, public app URL, and CORS mode so the frontend can
  verify a remote backend configuration.
