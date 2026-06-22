#!/usr/bin/env node
import {
  ANALYSIS_SPAN_YEARS,
  resolveAnalysisWindow
} from "../services/api/src/use-cases/uc-002-event-analysis/analysis-window.mjs";

const cases = [
  {
    name: "default span three years",
    run: () => {
      const end = Date.UTC(2026, 4, 29);
      const { startTs, spanYears } = resolveAnalysisWindow("AI 芯片", end);
      const span = (end - startTs) / (365.25 * 86400000);
      return spanYears === ANALYSIS_SPAN_YEARS && span >= 2.9 && span <= 3.1;
    }
  },
  {
    name: "ru conflict from 2014",
    run: () => {
      const { startTs, longConflict } = resolveAnalysisWindow("俄乌冲突");
      return longConflict && startTs <= new Date("2014-03-01T00:00:00.000Z").getTime();
    }
  }
];

let failed = 0;
for (const item of cases) {
  if (!item.run()) {
    console.error(`[test:analysis-window] fail: ${item.name}`);
    failed += 1;
  } else {
    console.log(`[test:analysis-window] ok: ${item.name}`);
  }
}
if (failed) process.exit(1);
