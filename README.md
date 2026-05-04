# Multi-Agent Platform

Phase 1 of a multi-agent orchestration workspace. The repo now has a runnable
React app scaffold and a canonical platform shell that works without any
external model provider.

## Current structure

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

## GitHub Pages

- The live Pages site should be deployed from the built `dist/` output, not from
  the repository root source files.
- `.github/workflows/deploy-pages.yml` now builds and deploys the Vite app to
  GitHub Pages on every push to `main`.
- In repository settings, set Pages to use `GitHub Actions` as the source.

## Phase 5 notes

- The backend now persists completed runs to `backend/data/nexus-runs.json`.
- `GET /api/nexus/runs` exposes saved backend runs for the frontend session list.
- Backend mode now has both execution and persisted history, rather than relying
  only on browser-local session storage.

## Agent roles

- The five-agent structure remains stable for compatibility.
- Each role now includes an advanced skill stack and expected deliverable.
- Those skill profiles are visible in the UI and are used in runtime-generated
  plans, directives, and specialist outputs.
