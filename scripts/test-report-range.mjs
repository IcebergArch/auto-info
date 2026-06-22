#!/usr/bin/env node
import { todayProductKey } from "../services/api/src/shared/utils.mjs";
import {
  reportRangeFromDays,
  reportRangeFromMonth
} from "../services/api/src/use-cases/uc-001-daily-events/service.mjs";

const today = todayProductKey();
const month = today.slice(0, 7);

const cases = [
  {
    name: "month backfill caps at today",
    run: () => {
      const range = reportRangeFromMonth(month);
      if (range.error) return false;
      return range.to === today && !range.dates.some((d) => d > today);
    }
  },
  {
    name: "days backfill does not exceed today",
    run: () => {
      const range = reportRangeFromDays(7, today);
      return !range.error && range.to === today && !range.dates.some((d) => d > today);
    }
  }
];

let failed = 0;
for (const item of cases) {
  if (!item.run()) {
    console.error(`[test:report-range] fail: ${item.name}`);
    failed += 1;
  } else {
    console.log(`[test:report-range] ok: ${item.name}`);
  }
}
if (failed) process.exit(1);
console.log(`[test:report-range] done: ${cases.length} passed`);
