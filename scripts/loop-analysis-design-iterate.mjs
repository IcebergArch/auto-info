#!/usr/bin/env node
/**
 * 动态 loop：分析分层 UI 迭代（v1.1 → v2.0 → v3.0 文档归档）
 * 用法（由 agent 在交付 v1 后后台启动）:
 *   node scripts/loop-analysis-design-iterate.mjs
 */
const VERSIONS = [
  {
    version: "v1.1.0",
    slug: "region-filter",
    prompt:
      "分析页 v1.1：实现地区点击筛选联动 EventLinesChart 节点；更新 spec 与 docs/design/analysis-layered/ 归档；npm test。"
  },
  {
    version: "v2.0.0",
    slug: "figma-parity",
    prompt:
      "分析页 v2.0：按 docs/design/analysis-layered 与 Figma use_figma 补全高保真分层屏；强化立体透视与图例；归档 RELEASE.md。"
  },
  {
    version: "v3.0.0",
    slug: "polish-3d",
    prompt:
      "分析页 v3.0：打磨三维分层动效、无障碍与移动端；Design 审查；npm test + 双端在线。"
  }
];

const delayHours = Number(process.env.ANALYSIS_LOOP_HOURS || 6);
const delayMs = Math.max(1, delayHours) * 3600 * 1000;

console.log(`[loop:analysis-design] armed: ${VERSIONS.length} ticks every ~${delayHours}h`);

for (let i = 0; i < VERSIONS.length; i += 1) {
  const tick = VERSIONS[i];
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const payload = JSON.stringify({ ...tick, index: i + 1, total: VERSIONS.length });
  console.log(`AGENT_LOOP_WAKE_analysis-design ${payload}`);
}

console.log("[loop:analysis-design] complete");
