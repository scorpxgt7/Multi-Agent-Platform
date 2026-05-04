export const AGENT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"];

export const STATUS_COLOR = {
  idle: "#252f3a",
  thinking: "#f59e0b",
  active: "#10b981",
  done: "#10b981",
  error: "#ef4444",
};

export const DEFAULT_AGENTS = [
  {
    id: "a1",
    name: "Researcher",
    specialty: "Research & Intel",
    description: "Gathers relevant facts, context, and source inputs for the task.",
    deliverable: "evidence brief",
    advancedSkills: ["signal discovery", "source triangulation", "domain mapping", "constraint extraction"],
  },
  {
    id: "a2",
    name: "Analyst",
    specialty: "Data Analysis",
    description: "Sorts signals, identifies patterns, and sharpens the problem framing.",
    deliverable: "insight model",
    advancedSkills: ["pattern analysis", "tradeoff scoring", "root-cause framing", "decision criteria design"],
  },
  {
    id: "a3",
    name: "Strategist",
    specialty: "Strategic Plan",
    description: "Turns findings into an execution plan with priorities and tradeoffs.",
    deliverable: "execution roadmap",
    advancedSkills: ["priority sequencing", "risk planning", "dependency mapping", "scenario design"],
  },
  {
    id: "a4",
    name: "Writer",
    specialty: "Content & Comms",
    description: "Packages the work into clear output for stakeholders or operators.",
    deliverable: "stakeholder-ready narrative",
    advancedSkills: ["message architecture", "audience adaptation", "structured drafting", "concise synthesis"],
  },
  {
    id: "a5",
    name: "Reviewer",
    specialty: "Quality Assurance",
    description: "Checks gaps, risks, and readiness before the final delivery.",
    deliverable: "readiness review",
    advancedSkills: ["gap detection", "risk review", "quality control", "approval gating"],
  },
];

export const EMPTY_STATUSES = {
  manager: "idle",
  supervisor: "idle",
  a1: "idle",
  a2: "idle",
  a3: "idle",
  a4: "idle",
  a5: "idle",
};

export const TASK_PRESETS = [
  {
    id: "discovery",
    label: "Research Brief",
    category: "Discovery",
    summary: "Frame a new opportunity, collect the strongest signals, and convert them into a focused next-step brief.",
    outcome: "evidence-backed opportunity brief",
    task: "Research a new market opportunity, summarize the strongest signals, and propose the next actions.",
  },
  {
    id: "operations",
    label: "Operations Workflow",
    category: "Operations",
    summary: "Map a repeatable workflow for intake, validation, execution, review, and delivery across a small team.",
    outcome: "repeatable operating workflow",
    task: "Design a repeatable workflow for intake, validation, execution, quality review, and delivery.",
  },
  {
    id: "product",
    label: "Product Planning",
    category: "Product",
    summary: "Break an initiative into requirements, priorities, risks, and execution order so delivery can start cleanly.",
    outcome: "prioritized product roadmap",
    task: "Break down a product initiative into user needs, requirements, implementation steps, risks, and rollout priorities.",
  },
  {
    id: "content",
    label: "Content Operations",
    category: "Content",
    summary: "Coordinate research, planning, drafting, and review into a publishable content workflow.",
    outcome: "publish-ready content package",
    task: "Plan a content operations workflow that covers topic research, outline creation, drafting, review, and final publishing handoff.",
  },
  {
    id: "qa-review",
    label: "QA Review",
    category: "Quality",
    summary: "Inspect an existing workflow or deliverable, identify gaps, and define concrete corrective actions.",
    outcome: "risk-ranked QA review",
    task: "Run a quality review on an existing process, identify the highest-risk gaps, and recommend targeted fixes with owner-ready actions.",
  },
];
