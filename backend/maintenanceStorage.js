import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve("backend/data");
const MAINTENANCE_PATH = path.join(DATA_DIR, "nexus-maintenance.json");
const MAX_REVIEWS = 100;

async function loadReviews() {
  try {
    const raw = await fs.readFile(MAINTENANCE_PATH, "utf8");
    const payload = JSON.parse(raw);
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function saveReviews(reviews) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(MAINTENANCE_PATH, JSON.stringify(reviews.slice(0, MAX_REVIEWS), null, 2));
}

export async function saveMaintenanceReview(review) {
  const reviews = await loadReviews();
  reviews.unshift(review);
  await saveReviews(reviews);
}

export async function listMaintenanceReviews(limit = 20) {
  const reviews = await loadReviews();
  return reviews.slice(0, Math.max(1, Math.min(limit, 100)));
}

export async function getLatestMaintenanceReview() {
  const reviews = await loadReviews();
  return reviews[0] || null;
}

export function getMaintenanceStorageMeta() {
  return {
    mode: "json",
    location: MAINTENANCE_PATH,
  };
}
