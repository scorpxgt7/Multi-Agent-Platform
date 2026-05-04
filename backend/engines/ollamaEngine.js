import { buildDirectiveMap } from "../../src/features/nexus/runtime/localRuntime.js";

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

function timeStamp() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function requestOllama(messages, { temperature = 0.3, maxTokens = 700 } = {}) {
  let response;

  try {
    response = await fetch(`${OLLAMA_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer ollama",
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });
  } catch (error) {
    throw new Error(`Ollama is not reachable at ${OLLAMA_BASE_URL}. Start Ollama and pull ${OLLAMA_MODEL}. ${error.message}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama request failed with status ${response.status}: ${text}`);
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return content.trim();
}

function buildMessages(system, user) {
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function probeOllama() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/models`, {
      headers: {
        Authorization: "Bearer ollama",
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const ollamaEngine = {
  id: "ollama",
  label: "Ollama Local AI",
  description: "Optional local-model engine that uses Ollama through its OpenAI-compatible API.",
  async isAvailable() {
    return probeOllama();
  },
  async run({ task, agents }) {
    const entries = [];
    const statuses = [];
    const collected = {};
    const directiveMap = buildDirectiveMap(task, agents);

    const addEntry = (from, message, type = "system") => {
      entries.push({
        id: entries.length + 1,
        from,
        message,
        type,
        time: timeStamp(),
      });
    };

    addEntry("SYSTEM", `Runtime mode: backend adapter with Ollama model ${OLLAMA_MODEL}.`);

    statuses.push({ id: "manager", status: "thinking" });
    addEntry("MANAGER", "Drafting plan with local AI...");
    const managerPlan = await requestOllama(
      buildMessages(
        "You are an operations manager coordinating a five-specialist execution team. Be concise, structured, and practical.",
        [
          `Task: ${task}`,
          "Write an operating plan with these sections only:",
          "Objective",
          "Operating plan",
          "Team focus",
          `Team: ${agents.map((agent) => `${agent.name} (${agent.specialty})`).join(", ")}`,
        ].join("\n"),
      ),
      { temperature: 0.2, maxTokens: 500 },
    );
    statuses.push({ id: "manager", status: "done" });
    addEntry("MANAGER", managerPlan, "output");

    statuses.push({ id: "supervisor", status: "thinking" });
    addEntry("SUPERVISOR", "Preparing specialist directives...");
    const supervisorBrief = await requestOllama(
      buildMessages(
        "You are a supervisor issuing specialist directives. Keep instructions concrete and handoff-oriented.",
        [
          `Task: ${task}`,
          "Directives:",
          ...agents.map((agent) => `${agent.name}: ${directiveMap[agent.name]}`),
        ].join("\n"),
      ),
      { temperature: 0.2, maxTokens: 650 },
    );
    statuses.push({ id: "supervisor", status: "done" });
    addEntry("SUPERVISOR", supervisorBrief, "output");

    for (let index = 0; index < agents.length; index += 1) {
      const agent = agents[index];
      const previousOutputs = agents
        .slice(0, index)
        .map((previousAgent) => `${previousAgent.name}: ${compactText(collected[previousAgent.name] || "No prior output.")}`)
        .join("\n");

      statuses.push({ id: "supervisor", status: "active" });
      statuses.push({ id: agent.id, status: "thinking" });
      addEntry(agent.name.toUpperCase(), `Assigned. Starting ${agent.specialty} with Ollama...`);

      const contribution = await requestOllama(
        buildMessages(
          `You are ${agent.name}, a specialist in ${agent.specialty}. Produce concise, practical output only.`,
          [
            `Task: ${task}`,
            `Role: ${agent.specialty}`,
            `Description: ${agent.description}`,
            `Expected deliverable: ${agent.deliverable || "specialist output"}`,
            `Advanced skills: ${(agent.advancedSkills || []).join(", ") || "general problem solving"}`,
            `Directive: ${directiveMap[agent.name]}`,
            previousOutputs ? `Prior context:\n${previousOutputs}` : "Prior context: none",
            "Return a compact contribution that helps the next specialist continue immediately.",
          ].join("\n\n"),
        ),
        { temperature: 0.35, maxTokens: 700 },
      );

      collected[agent.name] = contribution;
      statuses.push({ id: agent.id, status: "done" });
      addEntry(agent.name.toUpperCase(), contribution, "output");
    }

    statuses.push({ id: "supervisor", status: "thinking" });
    addEntry("SUPERVISOR", "Synthesizing specialist outputs...");
    const synthesis = await requestOllama(
      buildMessages(
        "You are a supervisor synthesizing multi-agent outputs into an integrated view.",
        [
          `Task: ${task}`,
          ...agents.map((agent) => `${agent.name}: ${compactText(collected[agent.name])}`),
          "Return a concise synthesis with integrated view, key risks, and next action guidance.",
        ].join("\n"),
      ),
      { temperature: 0.25, maxTokens: 700 },
    );
    statuses.push({ id: "supervisor", status: "done" });
    addEntry("SUPERVISOR", "Synthesis complete. Escalating to Manager.");

    statuses.push({ id: "manager", status: "thinking" });
    addEntry("MANAGER", "Preparing final deliverable...");
    const finalOutput = await requestOllama(
      buildMessages(
        "You are the final manager assembling the delivery. Produce a stakeholder-ready final report with practical next steps.",
        [
          `Task: ${task}`,
          `Manager plan:\n${managerPlan}`,
          `Supervisor synthesis:\n${synthesis}`,
          "Specialist outputs:",
          ...agents.map((agent) => `${agent.name}: ${compactText(collected[agent.name])}`),
          "Return sections named exactly: Executive Summary, Specialist Outputs, Supervisor Synthesis, Recommended Next Steps.",
        ].join("\n\n"),
      ),
      { temperature: 0.25, maxTokens: 900 },
    );
    statuses.push({ id: "manager", status: "done" });
    addEntry("MANAGER", "Mission complete. Final report ready.", "success");

    return {
      managerPlan,
      supervisorBrief,
      synthesis,
      finalOutput,
      collected,
      statuses,
      entries,
    };
  },
};
