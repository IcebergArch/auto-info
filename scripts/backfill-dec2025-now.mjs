#!/usr/bin/env node
/** 回溯补齐 2025-12 至今：日报（按月分批）+ 科技雷达月归档 */

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 4173;
const BASE = `http://${HOST}:${PORT}`;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `${path} HTTP ${res.status}`);
  }
  return json;
}

const today = new Date().toISOString().slice(0, 10);

async function main() {
  console.log("[backfill] daily reports", "2025-12-01", "→", today);
  const reports = await post("/api/v1/daily-events/report/backfill", {
    from: "2025-12-01",
    to: today,
    pullSources: false
  });
  console.log(
    "[backfill] reports ok:",
    reports.chunked ? `${reports.chunks} chunks` : "single",
    reports.totalDays,
    "days"
  );

  const radar = await post("/api/v1/tech-radar/backfill", {
    fromMonth: "2025-12",
    toMonth: today.slice(0, 7)
  });
  console.log("[backfill] tech-radar months created:", radar.created);
}

main().catch((error) => {
  console.error("[backfill] failed:", error.message);
  process.exit(1);
});
