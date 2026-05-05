export const AGENT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f97316", "#14b8a6"];

export const STATUS_COLOR = {
  idle: "#252f3a",
  thinking: "#f59e0b",
  active: "#10b981",
  done: "#10b981",
  error: "#ef4444",
};

const MISSION_AGENTS = [
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

const MISSION_PRESETS = [
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

const ADMIN_AGENTS = [
  {
    id: "a1",
    name: "Finance",
    specialty: "Finance & Unit Economics",
    description: "Models costs, pricing, margin, and operating tradeoffs for business decisions.",
    deliverable: "budget and revenue note",
    advancedSkills: ["cost modeling", "margin analysis", "pricing scenarios", "forecast framing"],
  },
  {
    id: "a2",
    name: "Marketing",
    specialty: "Marketing Strategy",
    description: "Shapes positioning, audience strategy, channels, and campaign structure.",
    deliverable: "campaign and positioning brief",
    advancedSkills: ["audience mapping", "channel planning", "offer framing", "content strategy"],
  },
  {
    id: "a3",
    name: "Sales",
    specialty: "Sales Operations",
    description: "Builds pipeline logic, offer sequencing, and follow-up plays for commercial execution.",
    deliverable: "sales workflow and outreach plan",
    advancedSkills: ["ICP qualification", "pipeline design", "objection handling", "outreach sequencing"],
  },
  {
    id: "a4",
    name: "Legal",
    specialty: "Legal & Policy Review",
    description: "Flags policy, contract, and compliance risks before outputs move downstream.",
    deliverable: "risk and policy review",
    advancedSkills: ["issue spotting", "policy review", "contract red flags", "compliance framing"],
  },
  {
    id: "a5",
    name: "Admin Ops",
    specialty: "Administrative Control",
    description: "Combines business inputs into an operator-ready decision pack and checks approval readiness.",
    deliverable: "admin action pack",
    advancedSkills: ["cross-functional synthesis", "approval gating", "handoff packaging", "operator readiness"],
  },
];

const ADMIN_PRESETS = [
  {
    id: "finance-forecast",
    label: "Finance Forecast",
    category: "Finance",
    summary: "Estimate the first operating model, expected costs, risk points, and realistic revenue posture for a business initiative.",
    outcome: "operator-ready financial outlook",
    task: "Build a first-pass operating forecast with costs, likely revenue bands, key assumptions, and the largest financial risks.",
  },
  {
    id: "marketing-launch",
    label: "Marketing Launch",
    category: "Marketing",
    summary: "Define positioning, audience, offer, channels, and launch motions for a practical go-to-market push.",
    outcome: "launch-ready marketing brief",
    task: "Design a launch plan covering positioning, target audience, main offer, channels, campaign structure, and content priorities.",
  },
  {
    id: "sales-playbook",
    label: "Sales Playbook",
    category: "Sales",
    summary: "Translate the offer into qualification logic, outreach steps, follow-up structure, and commercial handoff actions.",
    outcome: "repeatable sales playbook",
    task: "Create a sales playbook with ICP criteria, qualification gates, outreach sequencing, objection handling, and follow-up checkpoints.",
  },
  {
    id: "legal-screen",
    label: "Legal Risk Screen",
    category: "Legal",
    summary: "Spot contractual, policy, and compliance concerns early so higher-risk actions can be escalated before execution.",
    outcome: "risk-ranked legal review",
    task: "Run a legal and policy screening pass on a planned initiative, highlight key risks, and identify what must be escalated before rollout.",
  },
  {
    id: "admin-decision-pack",
    label: "Executive Decision Pack",
    category: "Admin",
    summary: "Combine finance, marketing, sales, and legal viewpoints into one operator-ready decision brief with clear approval points.",
    outcome: "cross-functional decision pack",
    task: "Produce an executive decision pack that combines financial posture, go-to-market logic, sales execution, legal concerns, and approval-ready next steps.",
  },
];

export function buildEmptyStatuses(agents) {
  return agents.reduce((accumulator, agent) => ({
    ...accumulator,
    [agent.id]: "idle",
  }), {
    manager: "idle",
    supervisor: "idle",
  });
}

export const SUBSYSTEMS = [
  {
    id: "mission",
    label: "Mission Core",
    badge: "Default",
    purpose: "General-purpose orchestration for research, planning, delivery, and QA workflows.",
    notes: "Best default for product, operations, discovery, and internal execution tasks.",
    approvalPosture: "standard",
    agents: MISSION_AGENTS,
    presets: MISSION_PRESETS,
  },
  {
    id: "admin",
    label: "Admin Control",
    badge: "Business Ops",
    purpose: "Business-facing orchestration for finance, marketing, sales, legal, and operator decision support.",
    notes: "Use this lane for internal business reviews, cross-functional planning, and approval-heavy administrative work.",
    approvalPosture: "strict",
    agents: ADMIN_AGENTS,
    presets: ADMIN_PRESETS,
  },
];

export function getSubsystemById(subsystemId) {
  return SUBSYSTEMS.find((subsystem) => subsystem.id === subsystemId) || SUBSYSTEMS[0];
}

export const DEFAULT_AGENTS = getSubsystemById("mission").agents;
export const TASK_PRESETS = getSubsystemById("mission").presets;
export const EMPTY_STATUSES = buildEmptyStatuses(DEFAULT_AGENTS);
