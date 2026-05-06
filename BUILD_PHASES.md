# Build Phases

This file tracks future implementation phases for the multi-agent AI platform.
These entries are planning inputs and execution constraints for later work.

## phase_1_foundation

You are working on a multi-agent AI platform.

### Objective

Set up the base structure:

- Create project folders:
  - `/services`
  - `/shared`
  - `/infra`
  - `/frontend`
- Add shared database config using SQLAlchemy
- Add a base FastAPI app template

### Constraints

- Do not implement business logic yet
- Do not merge services
- Keep the structure modular

### Notes

- This phase is a foundation-only scaffold.
- It should define service boundaries and shared infrastructure without coupling service responsibilities.
- It should stay safe for later expansion into skills, agents, teams, orchestration, governance, and memory.

## phase_2_services

Implement the core services:

1. `skill-service`
2. `agent-service`
3. `policy-service`
4. `memory-service`

### Requirements

- FastAPI per service
- Independent models
- REST endpoints

### Constraints

- Do not implement orchestration yet
- Do not connect services tightly

### Notes

- Each service should remain independently deployable.
- Shared utilities are allowed, but service business boundaries should stay separate.
- This phase should stop at service-level CRUD and execution surfaces, without introducing cross-service workflow control.

## phase_3_orchestrator

Implement `orchestrator-service` using LangGraph.

### Features

- Head admin agent
- Delegation to specialist agents such as finance and legal
- Conditional routing
- State passing

### Constraints

- Must call `skill-service` via API
- Do not embed specialist execution logic directly inside the orchestrator

### Notes

- The orchestrator should coordinate, not absorb service responsibilities.
- Agent decisions should be represented as workflow state transitions, API calls, and policy-aware routing.
- This phase should introduce multi-agent flow control while keeping skills and business logic externalized.

## phase_4_infra

Implement the infrastructure layer.

### Deliverables

- `docker-compose.yml`
- nginx configuration
- environment variable management

### Requirements

- postgres
- redis
- all services connected
- no hardcoded secrets

### Notes

- Infrastructure should support local development and future production packaging.
- Service discovery, port wiring, and shared runtime configuration should be environment-driven.
- Secrets must remain externalized through env files, secret stores, or deployment-time injection.

## phase_5_advanced

Add advanced systems as scaffold-only extensions.

### Scope

- plugin system for external skills
- billing system for usage tracking
- learning loop for agent improvement

### Constraint

- scaffold only
- no full implementation in this phase

### Notes

- This phase should reserve clear service boundaries, contracts, and extension points.
- The plugin system should prepare for externally managed skills without tightly coupling them to core services.
- The billing system should focus on usage-event shape, metering hooks, and future reporting boundaries.
- The learning loop should remain a controlled framework for future agent improvement, not a self-modifying runtime in this phase.

## post_phase_3_local_model_strategy

After Phase 3 is working and the orchestration APIs are stable, local model support can be added.

### Recommended approach

Do not use a hardcoded branching flag such as:

```python
USE_LOCAL = False

if USE_LOCAL:
    response = ollama_call(prompt)
else:
    response = openai_call(prompt)
```

Use a provider adapter instead.

### Practical design

- add a model provider interface behind the orchestrator or skill execution layer
- select the active provider from environment configuration
- keep Ollama optional and local-only
- keep hosted providers optional and swappable
- never make local Ollama a required dependency for the public frontend or base platform flow

### Suggested provider modes

- `mock`
- `ollama`
- `openai`

### Recommended environment pattern

```env
MODEL_PROVIDER=mock
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3:8b
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4.1-mini
```

### Model guidance

- `llama3:8b`
  - recommended starting local model
  - fast and light
  - good for low-friction local development
- `mixtral`
  - consider later if stronger reasoning is needed
  - should remain optional because it adds more runtime weight

### Constraints

- only add this after Phase 3 orchestration is stable
- do not couple provider logic directly to the workflow graph
- do not let provider selection leak into frontend deployment assumptions

### Notes

- the most practical implementation point is the skill execution boundary or a dedicated provider service, not the graph itself
- this keeps the orchestrator focused on delegation and state flow rather than model vendor logic
- Ollama is useful if it stays optional and isolated behind a provider contract, which avoids future friction
