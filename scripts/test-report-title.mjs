#!/usr/bin/env node
import { reportDisplayTitle, todayProductKey } from "../services/api/src/shared/utils.mjs";

const today = todayProductKey();
const cases = [
  {
    name: "today label",
    run: () => reportDisplayTitle(today) === "今日日报"
  },
  {
    name: "past date rewrites stored 今日日报",
    run: () => reportDisplayTitle("2026-05-29", "今日日报") === "2026-05-29 日报"
  },
  {
    name: "past date default",
    run: () => reportDisplayTitle("2026-05-28") === "2026-05-28 日报"
  }
];

let failed = 0;
for (const item of cases) {
  if (!item.run()) {
    console.error(`[test:report-title] fail: ${item.name}`);
    failed += 1;
  } else {
    console.log(`[test:report-title] ok: ${item.name}`);
  }
}
if (failed) process.exit(1);
console.log(`[test:report-title] done: ${cases.length} passed`);
