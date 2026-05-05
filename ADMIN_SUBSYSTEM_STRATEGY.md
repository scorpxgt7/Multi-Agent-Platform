# Admin Subsystem Strategy

This guide defines the safest way to add an `Admin` subsystem without breaking
the current product shell, runtime model, or deployment posture.

## Purpose

Use the Admin subsystem for operator-side business functions that should remain
separate from the main execution team. Typical examples:

- finance agent
- marketing agent
- sales agent
- legal agent
- operations / compliance agent

The goal is not to bolt more agents into the default five-agent pipeline. The
goal is to add a second, purpose-built orchestration lane with its own data
inputs, guardrails, and approvals.

## Core rule

Do not expand the current five-agent execution chain into a large mixed team.

That would create prompt overlap, unstable outputs, and harder maintenance.
Instead:

1. Keep the existing five-agent runtime as the default mission pipeline.
2. Add Admin as a separate subsystem with its own presets and agent roster.
3. Route only Admin-class tasks into that subsystem.

## Recommended architecture

### 1. Keep one platform shell

The frontend should remain one app:

- one shared dashboard
- one shared runtime panel
- one shared run history surface

But the task layer should support multiple `system modes`:

- `mission`
- `admin`
- later:
  - `support`
  - `research lab`
  - `compliance`

### 2. Add subsystem definitions, not hardcoded agent sprawl

Represent each subsystem as structured configuration:

- subsystem id
- display name
- purpose
- allowed runtimes
- default engine preference
- approval policy
- agent list
- presets

This lets the app load a subsystem the same way it already loads workflow
presets and agent definitions.

### 3. Separate data contracts by subsystem

Admin tasks should not share the same assumptions as the current mission flow.

For example:

- finance tasks may need budget, pricing, cost, and forecast inputs
- marketing tasks may need audience, offer, channel, and content inputs
- sales tasks may need lead stage, ICP, objections, and pipeline inputs
- legal tasks may need jurisdiction, risk level, and document references

So each subsystem should define:

- task schema
- required fields
- optional fields
- output format
- approval checkpoints

### 4. Keep backend engines generic

Do not build a separate backend engine per business department unless there is
clear operational value.

Keep the current engine layer generic:

- `local-simulation`
- `rules-first`
- `ollama`
- future hosted model engines

The subsystem should shape prompts, workflow presets, and validation, while the
engine remains a transport/execution layer.

## Practical build order

### Phase A: subsystem registry

Add a registry under `src/features/nexus/` and eventually mirror it in backend
contracts:

- `subsystems.js`
- `adminPresets.js`
- `adminAgents.js`

This phase should only introduce:

- subsystem selector in the UI
- admin-only presets
- admin agent roster

No backend contract change is required yet.

### Phase B: admin task schemas

Add task validation for Admin presets:

- finance brief
- marketing plan
- sales playbook
- legal review request

This phase should make inputs explicit and reduce vague prompts.

### Phase C: admin persistence and views

Add filtered run history and metadata for subsystem runs:

- subsystem id on each run
- subsystem filter in run history
- subsystem-specific artifact labels

### Phase D: admin approvals

Admin tasks often affect business decisions. Add stricter approvals for:

- finance recommendations
- legal review outputs
- pricing or contract-related changes

The right model is:

- generate recommendation
- require operator approval
- only then allow export, handoff, or execution

### Phase E: admin knowledge sources

Only after the subsystem is stable should it connect to structured inputs such
as:

- internal policy docs
- pricing tables
- lead qualification templates
- campaign plans

Keep that behind the backend, not in the public frontend.

## Recommended Admin v1 roster

### Finance agent

Use for:

- cost modeling
- pricing analysis
- budget summaries
- first-pass revenue scenarios

Expected deliverables:

- budget note
- pricing recommendation
- margin or ROI snapshot

### Marketing agent

Use for:

- positioning drafts
- campaign planning
- content calendar proposals
- audience/channel recommendations

Expected deliverables:

- campaign brief
- positioning note
- content plan

### Sales agent

Use for:

- offer framing
- sales workflow suggestions
- objection handling structure
- follow-up playbooks

Expected deliverables:

- outreach sequence
- sales brief
- qualification checklist

### Legal agent

Use for:

- issue spotting
- policy review support
- contract red-flag summaries
- compliance reminders

Expected deliverables:

- risk summary
- review checklist
- escalation note

Important:

This agent should be positioned as review support, not a replacement for
licensed counsel.

## Ollama fit for Admin

Ollama can help here if used as an optional private engine, not as the default
runtime.

The best pattern is:

1. Keep `local-simulation` as the no-friction default.
2. Keep `rules-first` for constrained operational flows.
3. Use `ollama` only when:
   - private local generation is needed
   - richer drafting is worth the extra model latency
   - the operator has the model installed and running

That keeps the current workflow stable while allowing stronger local AI for:

- finance drafts
- marketing copy variants
- sales messaging
- legal red-flag summaries

## Realistic guardrails

To keep the subsystem practical:

- never make Ollama mandatory for the public site
- never expose private Admin data handling in GitHub Pages-only mode
- keep admin execution behind the backend adapter
- default high-risk Admin outputs to approval-required
- store subsystem id on every run for auditing

## Completion bar for Admin v1

Call the Admin subsystem ready only when these exist:

1. subsystem selector
2. admin presets
3. admin agent roster
4. subsystem-tagged run records
5. approval policy for high-risk outputs
6. backend-only path for private business data

That is the practical route that adds real business value without destabilizing
the current build.
