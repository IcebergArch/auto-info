#!/usr/bin/env node
/** /loop 验收：科技雷达 feed 种子与弱文案 */

const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 4173;
const WEAK = /值得跟踪|；对象：|金融议题：/;

async function main() {
  const cfgRes = await fetch(`http://${HOST}:${PORT}/api/v1/config`);
  const cfg = cfgRes.ok ? await cfgRes.json() : {};
  const hours = Number(cfg.product?.refreshIntervalHours);
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
    console.error("[loop:tech-radar] fail: invalid product.refreshIntervalHours");
    process.exit(1);
  }

  const res = await fetch(`http://${HOST}:${PORT}/api/v1/tech-radar/feed`);
  if (!res.ok) {
    console.error("[loop:tech-radar] fail: HTTP", res.status);
    process.exit(1);
  }
  const json = await res.json();
  const recent = json.recent || [];
  const archives = json.archives || [];
  const hasHarness = recent.some((e) => /harness/i.test(`${e.term} ${e.title}`));
  const hasLoop = recent.some((e) => /loop|cursor/i.test(`${e.term} ${e.title}`));
  const hasBigTech = recent.some((e) =>
    /google|openai|anthropic|gemini|claude|\bx\b|xai|meta|nvidia|microsoft/i.test(
      `${e.term} ${e.title} ${(e.tags || []).join(" ")}`
    )
  );
  const clean = [...recent, ...archives].every((e) => !WEAK.test(`${e.title} ${e.brief}`));
  if (!hasHarness || !hasLoop || !hasBigTech || !clean) {
    console.error("[loop:tech-radar] fail", { hasHarness, hasLoop, hasBigTech, clean });
    process.exit(1);
  }
  console.log(`[loop:tech-radar] ok refresh=${hours}h recent=${recent.length} archives=${archives.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
