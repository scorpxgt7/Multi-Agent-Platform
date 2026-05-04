# Multi-Agent Platform

Phase 1 of a multi-agent orchestration workspace. The repo now has a runnable
React app scaffold and a canonical platform shell that works without any
external model provider.

## Current structure

- `nexus-agent-platform.jsx`
  Canonical Phase 1 platform and local orchestration runtime.
- `multi_agent_automation_platform.jsx`
  Alternate UI/reference artifact.
- `src/App.jsx`
  Runtime app entry that mounts the canonical platform.
- `SKILL.md`
  Local project guidance for future platform work.

## Run locally

1. Install dependencies:
   `npm install`
2. Start the dev server:
   `npm run dev`
3. Build for production:
   `npm run build`

## Phase 1 notes

- No external API is required to run the current app.
- The manager, supervisor, and specialist flow is simulated locally so the UI
  and orchestration structure can be validated before backend integration.
- Phase 2 should introduce a backend provider adapter, persistence, and
  approval checkpoints.
