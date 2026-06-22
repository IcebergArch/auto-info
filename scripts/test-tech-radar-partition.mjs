#!/usr/bin/env node

import {
  formatMonthDayLabel,
  lastDayOfMonth,
  monthPeriod,
  partitionTechRadarEntries,
  weekEndSundayKey
} from "../services/api/src/use-cases/uc-006-tech-radar/partition-radar.mjs";
import { buildTechRadarTimeline } from "../services/api/src/use-cases/uc-006-tech-radar/timeline-radar.mjs";

let failed = 0;

function ok(name, cond) {
  if (cond) console.log(`[test:tech-radar-partition] ok: ${name}`);
  else {
    console.error(`[test:tech-radar-partition] fail: ${name}`);
    failed += 1;
  }
}

ok("week end sunday", weekEndSundayKey("2026-06-12") === "2026-06-14");
ok("may full month", monthPeriod("2026-05").periodEnd === lastDayOfMonth("2026-05"));
ok("label md", formatMonthDayLabel("2026-06-17") === "6.17");

const sample = [
  { id: "d11", granularity: "day", occurredAt: "2026-06-11T10:00:00.000Z", title: "A", brief: "a" },
  { id: "d12", granularity: "day", occurredAt: "2026-06-12T10:00:00.000Z", title: "B", brief: "b" },
  { id: "d13", granularity: "day", occurredAt: "2026-06-13T10:00:00.000Z", title: "C", brief: "c" },
  { id: "d3", granularity: "day", occurredAt: "2026-06-03T10:00:00.000Z", title: "W1", brief: "w1", sources: [] },
  { id: "d10", granularity: "day", occurredAt: "2026-06-10T10:00:00.000Z", title: "W2", brief: "w2", sources: [] },
  { id: "d8", granularity: "day", occurredAt: "2026-06-08T10:00:00.000Z", title: "Open week", brief: "x", sources: [] },
  {
    id: "tech-month-2026-05",
    granularity: "month",
    occurredAt: "2026-05-01T00:00:00.000Z",
    title: "五月",
    brief: "may",
    relatedReportDates: ["2026-05-23", "2026-05-30"]
  }
];

const { recent, archives } = partitionTechRadarEntries(sample, "2026-06-13");
ok("recent includes latest days", ["d11", "d12", "d13", "d10"].every((id) => recent.some((e) => e.id === id)));
ok("incomplete week stays day", archives.some((e) => e.id === "d8" && e.granularity === "day"));
ok("completed week compressed", archives.some((e) => e.granularity === "week"));
const may = archives.find((e) => e.id === "tech-month-2026-05");
ok("month period 01-31", may?.periodStart === "2026-05-01" && may?.periodEnd === "2026-05-31");
ok("month term full range", may?.term === "5.01 — 5.31");
ok("month drops related dates", !may?.relatedReportDates?.length);

const { timeline } = buildTechRadarTimeline(sample, "2026-06-13");
ok("timeline has current month node", timeline.some((n) => n.id === "tr-month-2026-06"));
const june = timeline.find((n) => n.id === "tr-month-2026-06");
ok("current month expanded by default", june?.defaultExpanded === true);
ok("current month has week and day children", (june?.children?.length || 0) >= 2);
ok("timeline includes past month in current year", timeline.some((n) => n.id === "tr-month-2026-05"));

if (failed) process.exit(1);
console.log("[test:tech-radar-partition] done");
