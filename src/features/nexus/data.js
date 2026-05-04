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
    label: "Research Brief",
    task: "Research a new market opportunity, summarize the strongest signals, and propose the next actions.",
  },
  {
    label: "Operations Workflow",
    task: "Design a repeatable workflow for intake, validation, execution, quality review, and delivery.",
  },
  {
    label: "Product Planning",
    task: "Break down a product initiative into user needs, requirements, implementation steps, risks, and rollout priorities.",
  },
];
