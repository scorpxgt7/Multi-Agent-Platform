import crypto from "node:crypto";
import { getConfigAdvisories, loadConfig } from "./config.js";
import { recordDiagnosticEvent, getDiagnosticSummary } from "./diagnosticsStorage.js";
import { listEngines, getDefaultEngineId } from "./engines/index.js";
import { getLatestMaintenanceReview, getMaintenanceStorageMeta, listMaintenanceReviews, saveMaintenanceReview } from "./maintenanceStorage.js";
import { getPersistenceHealth, listRunSummaries } from "./storage.js";

let schedulerTimer = null;
let schedulerState = {
  enabled: false,
  mode: "disabled",
  intervalMinutes: null,
  dailyUtc: null,
  lastRunAt: null,
  nextRunAt: null,
  lastReviewId: null,
};

function calculateNextRunAt(config, now = new Date()) {
  if (!config.maintenanceEnabled) {
    return null;
  }

  if (config.maintenanceDailyUtc) {
    const [hourText, minuteText] = config.maintenanceDailyUtc.split(":");
    const next = new Date(now);
    next.setUTCHours(Number(hourText), Number(minuteText), 0, 0);
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next.toISOString();
  }

  const minutes = config.maintenanceIntervalMinutes || 1440;
  return new Date(now.getTime() + (minutes * 60 * 1000)).toISOString();
}

function summarizeChecks(checks) {
  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");
  if (failed.length) {
    return {
      status: "fail",
      message: `${failed.length} maintenance check(s) failed.`,
    };
  }
  if (warned.length) {
    return {
      status: "warn",
      message: `${warned.length} maintenance check(s) need attention.`,
    };
  }
  return {
    status: "healthy",
    message: "All maintenance checks passed.",
  };
}

export async function runMaintenanceReview({ source = "manual" } = {}) {
  const config = loadConfig();
  const [persistence, engines, diagnostics, runs, latestReview] = await Promise.all([
    getPersistenceHealth(),
    listEngines(),
    getDiagnosticSummary(),
    listRunSummaries(),
    getLatestMaintenanceReview(),
  ]);

  const defaultEngineId = getDefaultEngineId();
  const defaultEngine = engines.find((engine) => engine.id === defaultEngineId);
  const configAdvisories = getConfigAdvisories(config);
  const recentRuns = runs.slice(0, 10);
  const failedRuns = recentRuns.filter((run) => run.status === "failed");
  const recentErrorCount = diagnostics.byLevel?.error || 0;

  const checks = [
    {
      key: "persistence",
      status: persistence.degraded ? "warn" : persistence.available ? "pass" : "fail",
      message: persistence.degraded
        ? `Persistence is running in degraded mode via ${persistence.mode}.`
        : persistence.available
          ? `Persistence is healthy via ${persistence.mode}.`
          : "Persistence is unavailable.",
      details: persistence,
    },
    {
      key: "default_engine",
      status: !defaultEngine ? "fail" : defaultEngine.available ? "pass" : "fail",
      message: !defaultEngine
        ? `Configured default engine ${defaultEngineId} is unknown.`
        : defaultEngine?.available
        ? `Default engine ${defaultEngineId} is available.`
        : `Default engine ${defaultEngineId} is not available.`,
      details: {
        defaultEngineId,
        engines,
      },
    },
    {
      key: "recent_run_failures",
      status: failedRuns.length > 0 ? "warn" : "pass",
      message: failedRuns.length > 0
        ? `${failedRuns.length} failed run(s) found in the last ${recentRuns.length} saved runs.`
        : "No failed runs found in the recent run window.",
      details: {
        recentRunCount: recentRuns.length,
        failedRuns: failedRuns.map((run) => ({
          id: run.id,
          engine: run.engine,
          time: run.time,
          errorMessage: run.errorMessage,
        })),
      },
    },
    {
      key: "diagnostic_errors",
      status: recentErrorCount > 0 ? "warn" : "pass",
      message: recentErrorCount > 0
        ? `${recentErrorCount} backend diagnostic error event(s) detected in the last 24 hours.`
        : "No backend diagnostic error events detected in the last 24 hours.",
      details: diagnostics,
    },
    {
      key: "frontend_origin_alignment",
      status: config.publicAppUrl && !config.allowedOrigins.includes("*") && !config.allowedOrigins.some((origin) => config.publicAppUrl.startsWith(origin))
        ? "warn"
        : "pass",
      message: config.publicAppUrl
        ? "Public app URL is configured for deployment checks."
        : "Public app URL is not configured; remote deployment checks are limited.",
      details: {
        publicAppUrl: config.publicAppUrl || null,
        allowedOrigins: config.allowedOrigins,
      },
    },
    {
      key: "config_advisories",
      status: configAdvisories.some((advisory) => advisory.level === "warn") ? "warn" : "pass",
      message: configAdvisories.length
        ? `${configAdvisories.length} backend config advisory item(s) detected.`
        : "Backend config advisories are clean.",
      details: {
        advisories: configAdvisories,
      },
    },
  ];

  const summary = summarizeChecks(checks);
  const review = {
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    source,
    status: summary.status,
    summary: summary.message,
    checkCount: checks.length,
    warningCount: checks.filter((check) => check.status === "warn").length,
    failureCount: checks.filter((check) => check.status === "fail").length,
    checks,
    persistence,
    diagnosticsSnapshot: {
      recentEventCount: diagnostics.recentEventCount,
      errorCount: diagnostics.byLevel?.error || 0,
      warningCount: diagnostics.byLevel?.warning || 0,
      latestEvent: diagnostics.latestEvent || null,
    },
    recentRuns: {
      totalReviewed: recentRuns.length,
      failedCount: failedRuns.length,
    },
    previousReviewId: latestReview?.id || null,
  };

  await saveMaintenanceReview(review);
  schedulerState.lastRunAt = review.time;
  schedulerState.lastReviewId = review.id;
  schedulerState.nextRunAt = calculateNextRunAt(config);

  await recordDiagnosticEvent({
    id: crypto.randomUUID(),
    type: "maintenance_review_completed",
    level: review.status === "fail" ? "error" : review.status === "warn" ? "warning" : "info",
    message: review.summary,
    details: {
      reviewId: review.id,
      source: review.source,
      warningCount: review.warningCount,
      failureCount: review.failureCount,
    },
  });

  return review;
}

async function executeScheduledReview() {
  try {
    await runMaintenanceReview({ source: "scheduled" });
  } finally {
    scheduleNextMaintenanceRun();
  }
}

function clearSchedulerTimer() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
}

export function scheduleNextMaintenanceRun() {
  clearSchedulerTimer();
  const config = loadConfig();
  schedulerState.enabled = config.maintenanceEnabled;
  schedulerState.mode = config.maintenanceDailyUtc ? "daily-utc" : "interval";
  schedulerState.intervalMinutes = config.maintenanceIntervalMinutes;
  schedulerState.dailyUtc = config.maintenanceDailyUtc || null;

  if (!config.maintenanceEnabled) {
    schedulerState.mode = "disabled";
    schedulerState.nextRunAt = null;
    return;
  }

  const nextRunAt = calculateNextRunAt(config);
  schedulerState.nextRunAt = nextRunAt;
  const delay = Math.max(1000, new Date(nextRunAt).getTime() - Date.now());
  schedulerTimer = setTimeout(() => {
    void executeScheduledReview();
  }, delay);
}

export async function initializeMaintenanceScheduler() {
  const latestReview = await getLatestMaintenanceReview();
  schedulerState.lastRunAt = latestReview?.time || null;
  schedulerState.lastReviewId = latestReview?.id || null;
  scheduleNextMaintenanceRun();
}

export async function getMaintenanceStatus() {
  const latestReview = await getLatestMaintenanceReview();
  return {
    scheduler: { ...schedulerState },
    latestReview,
    storage: getMaintenanceStorageMeta(),
  };
}

export async function getMaintenanceReviews(limit = 10) {
  return listMaintenanceReviews(limit);
}
