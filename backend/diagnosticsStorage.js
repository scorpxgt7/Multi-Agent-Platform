import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("backend/data");
const DIAGNOSTICS_PATH = path.join(DATA_DIR, "nexus-diagnostics.json");
const MAX_EVENTS = 200;

async function loadEvents() {
  try {
    const raw = await fs.readFile(DIAGNOSTICS_PATH, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveEvents(events) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DIAGNOSTICS_PATH, JSON.stringify(events.slice(0, MAX_EVENTS), null, 2));
}

export async function recordDiagnosticEvent(event) {
  const events = await loadEvents();
  events.unshift({
    id: event.id,
    type: event.type,
    level: event.level || "info",
    message: event.message,
    time: event.time || new Date().toISOString(),
    source: event.source || "backend",
    details: event.details || null,
  });
  await saveEvents(events);
}

export async function listDiagnosticEvents(limit = 20) {
  const events = await loadEvents();
  return events.slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function getDiagnosticSummary() {
  const events = await loadEvents();
  const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
  const recentEvents = events.filter((event) => {
    const timestamp = Date.parse(event.time || "");
    return Number.isFinite(timestamp) && timestamp >= last24Hours;
  });

  const byLevel = recentEvents.reduce((accumulator, event) => {
    accumulator[event.level] = (accumulator[event.level] || 0) + 1;
    return accumulator;
  }, {});

  const byType = recentEvents.reduce((accumulator, event) => {
    accumulator[event.type] = (accumulator[event.type] || 0) + 1;
    return accumulator;
  }, {});

  return {
    totalEvents: events.length,
    recentEventCount: recentEvents.length,
    byLevel,
    byType,
    latestEvent: events[0] || null,
    recentEvents: events.slice(0, 5),
    storage: {
      mode: "json",
      location: DIAGNOSTICS_PATH,
    },
  };
}
