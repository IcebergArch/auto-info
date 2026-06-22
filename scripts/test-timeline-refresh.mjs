#!/usr/bin/env node
/** 共用时间线 refreshCutoff 锚点 */

import { buildRefreshCutoffEntry } from "../services/api/src/shared/timeline-refresh.mjs";

const dailyEmpty = buildRefreshCutoffEntry({
  date: "2026-06-03",
  refreshedAt: "2026-06-03T08:30:00.000Z",
  itemCount: 0,
  domain: "daily"
});
if (!dailyEmpty.isRefreshCutoff || !/暂无新增事件/.test(dailyEmpty.desc)) {
  console.error("[test:timeline-refresh] fail: daily empty", dailyEmpty);
  process.exit(1);
}

const radarFilled = buildRefreshCutoffEntry({
  date: "2026-06-02",
  refreshedAt: "2026-06-02T15:00:00.000Z",
  itemCount: 3,
  domain: "tech-radar",
  idPrefix: "tech-radar-refresh-cutoff"
});
if (radarFilled.id !== "tech-radar-refresh-cutoff-2026-06-02" || !/3/.test(radarFilled.desc)) {
  console.error("[test:timeline-refresh] fail: radar filled", radarFilled);
  process.exit(1);
}

console.log("[test:timeline-refresh] ok");
