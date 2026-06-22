#!/usr/bin/env node
/**
 * 动态 loop：科技雷达文案与外链质量（读 feed → 修月报 → 测）
 * 默认 4 小时后唤醒；可用 TECH_RADAR_LOOP_HOURS=2 node scripts/loop-tech-radar-quality.mjs
 */
const hours = Number(process.env.TECH_RADAR_LOOP_HOURS || 4);
const delayMs = Math.max(1, hours) * 3600 * 1000;

const prompt =
  "科技雷达质量迭代：检查 feed 月报是否仍有占位/无外链；必要时 POST repair-archives；补 spec/UI；npm test。";

await new Promise((resolve) => setTimeout(resolve, delayMs));
console.log(`AGENT_LOOP_WAKE_tech-radar-quality ${JSON.stringify({ prompt, hours })}`);
