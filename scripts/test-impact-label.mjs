#!/usr/bin/env node

import { compactImpactChartLabel } from "../services/api/src/use-cases/uc-002-event-analysis/impact-label.mjs";

const long =
  "两条事件通过标签「地缘」处于同一观察簇，需联合跟踪其传导链条。";

const cases = [
  {
    name: "shared tag compresses to 同簇·地缘 when no edge label",
    run: () => compactImpactChartLabel(long, "") === "同簇·地缘"
  },
  {
    name: "keeps short tag edge label on chart",
    run: () => compactImpactChartLabel(long, "地缘、冲突") === "地缘、冲突"
  },
  {
    name: "prefers short edge label",
    run: () => compactImpactChartLabel(long, "影响维度：风险") === "影响维度：风险"
  },
  {
    name: "no mid-sentence ellipsis on template",
    run: () => !compactImpactChartLabel(long, "").includes("处于同…")
  }
];

let failed = 0;
for (const item of cases) {
  const ok = item.run();
  if (ok) console.log(`✓ ${item.name}`);
  else {
    console.error(`✗ ${item.name}`);
    failed += 1;
  }
}
if (failed) process.exit(1);
console.log(`impact-label: ${cases.length} passed`);
