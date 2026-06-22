#!/usr/bin/env node
/** 脉络图时间坐标：历史压缩、近期展开（与前端 event-lines-time-scale.ts 保持一致） */

import { readFileSync } from "node:fs";

const MS_DAY = 86400000;
const MS_YEAR = 365.25 * MS_DAY;

function normalizeWidths(historyWidth, recentWidth) {
  const total = historyWidth + recentWidth;
  return {
    historyWidth: historyWidth / total,
    recentWidth: recentWidth / total
  };
}

function buildScale(startTs, endTs, meta) {
  const start = Number(startTs);
  const end = Math.max(start + 1, Number(endTs));
  const span = Math.max(1, end - start);
  const longConflict = meta?.mode === "long-conflict-balanced" || span / MS_YEAR > 3.5;
  const { historyWidth, recentWidth } = normalizeWidths(
    meta?.historyWidth ?? (longConflict ? 0.48 : 0.26),
    meta?.recentWidth ?? (longConflict ? 0.52 : 0.74)
  );
  const metaRecentStart = new Date(meta?.recentStart || "").getTime();
  const recentStartTs = Math.max(start, Math.min(end, Number.isFinite(metaRecentStart) ? metaRecentStart : end - MS_YEAR));
  const hasBreakpoint = recentStartTs > start + MS_DAY && recentStartTs < end - MS_DAY;
  const historySpan = Math.max(1, recentStartTs - start);
  const recentSpan = Math.max(1, end - recentStartTs);

  const toRatio = (ts) => {
    const t = Math.max(start, Math.min(end, Number(ts)));
    if (!hasBreakpoint) return (t - start) / span;
    if (t <= recentStartTs) return ((t - start) / historySpan) * historyWidth;
    return historyWidth + ((t - recentStartTs) / recentSpan) * recentWidth;
  };

  const fromRatio = (ratio) => {
    const r = Math.max(0, Math.min(1, ratio));
    if (!hasBreakpoint) return start + r * span;
    if (r <= historyWidth) return start + (r / historyWidth) * historySpan;
    return recentStartTs + ((r - historyWidth) / recentWidth) * recentSpan;
  };

  return { toRatio, fromRatio, hasBreakpoint, historyWidth, recentWidth };
}

const fullScale = buildScale(
  Date.parse("2014-02-20T00:00:00.000Z"),
  Date.parse("2026-06-02T00:00:00.000Z"),
  {
    mode: "long-conflict-balanced",
    historyWidth: 0.48,
    recentWidth: 0.52,
    recentStart: "2025-06-02T00:00:00.000Z"
  }
);

let failed = 0;

function ok(name, condition) {
  if (!condition) {
    console.error(`[test:event-lines-time-scale] fail: ${name}`);
    failed += 1;
    return;
  }
  console.log(`[test:event-lines-time-scale] ok: ${name}`);
}

const r2014 = fullScale.toRatio(Date.parse("2014-02-20T00:00:00.000Z"));
const r2022 = fullScale.toRatio(Date.parse("2022-02-24T00:00:00.000Z"));
const r2025 = fullScale.toRatio(Date.parse("2025-06-02T00:00:00.000Z"));
const r2026 = fullScale.toRatio(Date.parse("2026-06-02T00:00:00.000Z"));
const historyDensity = (r2022 - r2014) / (Date.parse("2022-02-24T00:00:00.000Z") - Date.parse("2014-02-20T00:00:00.000Z"));
const recentDensity = (r2026 - r2025) / (Date.parse("2026-06-02T00:00:00.000Z") - Date.parse("2025-06-02T00:00:00.000Z"));
const roundTrip = fullScale.fromRatio(fullScale.toRatio(Date.parse("2026-01-15T00:00:00.000Z")));
const oldWindow = buildScale(
  Date.parse("2018-01-01T00:00:00.000Z"),
  Date.parse("2022-01-01T00:00:00.000Z"),
  {
    mode: "long-conflict-balanced",
    historyWidth: 0.48,
    recentWidth: 0.52,
    recentStart: "2025-06-02T00:00:00.000Z"
  }
);

ok("long range has breakpoint", fullScale.hasBreakpoint);
ok("2022 is compressed into history side", r2022 < 0.36);
ok("recent density beats history density", recentDensity > historyDensity * 8);
ok("recent breakpoint lands on history width", Math.abs(r2025 - 0.48) < 0.001);
ok("roundtrip timestamp", Math.abs(roundTrip - Date.parse("2026-01-15T00:00:00.000Z")) < MS_DAY);
ok("old-only zoom falls back to linear", !oldWindow.hasBreakpoint && Math.abs(oldWindow.toRatio(Date.parse("2020-01-01T00:00:00.000Z")) - 0.5) < 0.02);

const chartSource = readFileSync("apps/web-react/src/components/EventLinesChart.tsx", "utf8");
const brushSource = readFileSync("apps/web-react/src/components/EventLinesTimeBrush.tsx", "utf8");
ok("chart consumes shared time scale", chartSource.includes("buildEventLinesTimeScale"));
ok("brush consumes shared time scale", brushSource.includes("timeScale: EventLinesTimeScale"));
ok("chart no longer uses linear view formula", !chartSource.includes("(clamped - viewStart) / viewSpan"));

if (failed) process.exit(1);
console.log("[test:event-lines-time-scale] done");
