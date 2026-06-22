#!/usr/bin/env node
/** 日报 eventWindow：不得跨日回填非当日事件 */

import { attachTodayTimeline } from "../services/api/src/use-cases/uc-001-daily-events/daily-report-presentation.mjs";
import {
  classifyReportBlock,
  getDailyReport,
  normalizeOverviewSummary
} from "../services/api/src/use-cases/uc-001-daily-events/service.mjs";
import { productDateKey, todayProductKey } from "../services/api/src/shared/utils.mjs";

function assert(cond, msg) {
  if (!cond) {
    console.error("[test:report-event-window] fail:", msg);
    process.exit(1);
  }
}

assert(
  productDateKey("2026-06-04T20:12:00.000Z") === "2026-06-05",
  "late UTC events should belong to the next product day"
);

const today = todayProductKey();
const report = await getDailyReport(new URLSearchParams({ date: today }));

assert(report.eventWindow?.from === today, `eventWindow.from must be ${today}`);
assert(report.eventWindow?.to === today, `eventWindow.to must be ${today}`);
assert(
  !/（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/.test(report.overview?.summary || ""),
  `today summary must not include cross-day collection note: ${report.overview?.summary}`
);

for (const event of report.events || []) {
  const day = productDateKey(event.occurredAt);
  assert(day === today, `event ${event.id} occurred on ${day}, expected ${today}`);
}

for (const item of report.timeline || []) {
  const day = productDateKey(item.at);
  if (day) assert(day === today, `timeline item ${item.id} on ${day}, expected ${today}`);
}

const sampleDate = "2026-06-02";
const sample = await getDailyReport(new URLSearchParams({ date: sampleDate }));
assert(
  !(sample.overview?.summary || "").includes("至") || !(sample.overview?.summary || "").includes("收录"),
  `day report must not use cross-day window suffix: ${sample.overview?.summary}`
);
const todayWithTimeline = await getDailyReport(new URLSearchParams({ date: today }));
const cutoff = (todayWithTimeline.timeline || []).find((item) => item.isRefreshCutoff);
assert(cutoff, "today timeline must include refresh cutoff anchor");
assert(
  !/（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/.test(todayWithTimeline.overview?.summary || ""),
  `polluted overview must be normalized: ${todayWithTimeline.overview?.summary}`
);
assert(
  normalizeOverviewSummary(
    "2026-06-03 · 21 条事件（含 2026-06-01 至 2026-06-02 收录）。测试。",
    today,
    0
  ) === `${today} 暂无匹配事件，日报保留空状态并等待新增来源。`,
  "normalizeOverviewSummary should strip cross-day note"
);

const sampleTimeline = attachTodayTimeline(sample, classifyReportBlock, 1).timeline || [];
const timed = sampleTimeline.filter((item) => item.at && !item.undated && !item.isRefreshCutoff);
for (let i = 1; i < timed.length; i += 1) {
  const prev = new Date(timed[i - 1].at).getTime();
  const cur = new Date(timed[i].at).getTime();
  assert(prev >= cur, `timeline on ${sampleDate} must be desc: index ${i - 1} before ${i}`);
}

console.log(
  `[test:report-event-window] ok: today events=${report.events?.length || 0}, sample=${sample.timeline?.length || 0}`
);
