#!/usr/bin/env node
/** 今日时间线：弱文案须被过滤，归档路径须 finalize */

import { isWeakTimelineCopy } from "../services/api/src/use-cases/uc-001-daily-events/event-decision-copy.mjs";
import {
  getDailyReport,
  repairStoredEventSummaries,
  updateDailyReport
} from "../services/api/src/use-cases/uc-001-daily-events/service.mjs";
import { todayProductKey } from "../services/api/src/shared/utils.mjs";

const WEAK = /值得跟踪|；对象：|；主体：|金融议题：|核心数据与措辞|以原文为准|呈下行或节奏放缓/;

function scanTimeline(report) {
  const items = report?.timeline || [];
  const bad = [];
  for (const item of items) {
    if (item.isRefreshCutoff) continue;
    const blob = `${item.displayTitle || ""} ${item.desc || ""}`;
    if (WEAK.test(blob) || isWeakTimelineCopy(item.displayTitle, item.desc)) {
      bad.push(item);
    }
  }
  return bad;
}

async function main() {
  const today = todayProductKey();
  const repaired = await repairStoredEventSummaries();
  await updateDailyReport({ date: today, pullSources: false });

  const report = await getDailyReport(new URLSearchParams({ date: today }));
  if (report.error) {
    console.error("[test:report-timeline] getDailyReport error:", report.error);
    process.exit(1);
  }

  const bad = scanTimeline(report);
  const finance = (report.timelineByLane?.finance || []).filter((i) => WEAK.test(`${i.displayTitle} ${i.desc}`));

  if (report.presentation !== "timeline") {
    console.error("[test:report-timeline] fail: today report must use timeline presentation");
    process.exit(1);
  }
  if (bad.length) {
    console.error("[test:report-timeline] fail: weak timeline entries", bad.map((i) => i.displayTitle));
    process.exit(1);
  }
  if (finance.length) {
    console.error("[test:report-timeline] fail: weak finance lane", finance.map((i) => i.displayTitle));
    process.exit(1);
  }
  if (!Array.isArray(report.timelineHours)) {
    console.error("[test:report-timeline] fail: timelineHours missing");
    process.exit(1);
  }
  if (!report.timelineByLane || !("other" in report.timelineByLane)) {
    console.error("[test:report-timeline] fail: timelineByLane.other missing");
    process.exit(1);
  }

  console.log(
    `[test:report-timeline] ok: repaired=${repaired}, timeline=${report.timeline?.length || 0}, finance=${report.timelineByLane?.finance?.length || 0}, other=${report.timelineByLane?.other?.length || 0}, hours=${report.timelineHours.length}`
  );
}

main().catch((error) => {
  console.error("[test:report-timeline] error:", error);
  process.exit(1);
});
