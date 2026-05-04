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
3. Build for production:
   `npm run build`

## Phase 2 notes

- No external API is required to run the current app.
- The manager, supervisor, and specialist flow is simulated locally so the UI
  and orchestration structure can be validated before backend integration.
- The orchestration shell and runtime are now split so a backend provider
  adapter can replace the local runtime without rewriting the UI.
- The next major additions should be persistence, approvals, and backend-backed
  execution adapters.
