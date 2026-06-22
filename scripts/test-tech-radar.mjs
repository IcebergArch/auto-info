#!/usr/bin/env node
/** UC-006 科技雷达：分区、种子、弱文案 */

import { entryMatchesBigTechFocus } from "../services/api/src/use-cases/uc-006-tech-radar/big-tech-focus.mjs";
import { PLACEHOLDER_ARCHIVE_RE } from "../services/api/src/use-cases/uc-006-tech-radar/archive-enrich.mjs";
import { addUtcDays } from "../services/api/src/use-cases/uc-006-tech-radar/partition-radar.mjs";
import { listTechRadarFeed } from "../services/api/src/use-cases/uc-006-tech-radar/service.mjs";
import { todayUtcKey } from "../services/api/src/shared/utils.mjs";

const WEAK = /值得跟踪|；对象：|金融议题：|核心数据与措辞/;

async function main() {
  const feed = await listTechRadarFeed(new URLSearchParams());
  const recentTerms = feed.recent.map((e) => e.term.toLowerCase());
  if (!recentTerms.some((t) => t.includes("harness"))) {
    console.error("[test:tech-radar] fail: missing harness in recent");
    process.exit(1);
  }
  if (!recentTerms.some((t) => t.includes("cursor") || t.includes("loop"))) {
    console.error("[test:tech-radar] fail: missing cursor loop in recent");
    process.exit(1);
  }
  const bigTechRecent = feed.recent.filter((e) => entryMatchesBigTechFocus(e));
  if (bigTechRecent.length < 2) {
    console.error("[test:tech-radar] fail: need >=2 big-tech platform entries in recent", bigTechRecent.length);
    process.exit(1);
  }
  if (!feed.archives.some((e) => e.granularity === "month" && String(e.occurredAt).startsWith("2026-05"))) {
    console.error("[test:tech-radar] fail: missing 2026-05 archive");
    process.exit(1);
  }
  if (!Array.isArray(feed.timeline) || !feed.timeline.length) {
    console.error("[test:tech-radar] fail: timeline missing");
    process.exit(1);
  }
  if (feed.refreshIntervalHours !== 1) {
    console.error("[test:tech-radar] fail: refresh interval must align with daily report at 1h", feed.refreshIntervalHours);
    process.exit(1);
  }
  const today = todayUtcKey();
  const todayCount = feed.recent.filter((e) => String(e.occurredAt || "").startsWith(today)).length;
  if (
    feed.todayWindow?.date !== today ||
    !String(feed.todayWindow?.startAt || "").startsWith(`${today}T00:00`) ||
    !feed.todayWindow?.endAt ||
    feed.todayWindow?.entryCount !== todayCount
  ) {
    console.error("[test:tech-radar] fail: invalid todayWindow", feed.todayWindow);
    process.exit(1);
  }
  if (!feed.refreshCutoff?.isRefreshCutoff || feed.refreshCutoff.id !== `tech-radar-refresh-cutoff-${today}`) {
    console.error("[test:tech-radar] fail: invalid refreshCutoff", feed.refreshCutoff);
    process.exit(1);
  }
  if (todayCount === 0 && !/暂无新增科技雷达条目/.test(feed.refreshCutoff.desc || "")) {
    console.error("[test:tech-radar] fail: refreshCutoff should describe empty today", feed.refreshCutoff.desc);
    process.exit(1);
  }
  if (todayCount > 0 && !feed.refreshCutoff.desc?.includes(String(todayCount))) {
    console.error("[test:tech-radar] fail: refreshCutoff should mention today count", feed.refreshCutoff.desc);
    process.exit(1);
  }
  if (!Array.isArray(feed.recentEmptyDays)) {
    console.error("[test:tech-radar] fail: recentEmptyDays missing");
    process.exit(1);
  }
  const yesterday = addUtcDays(today, -1);
  const occupiedDayKeys = new Set(
    [...feed.recent, ...feed.archives]
      .filter((e) => e.granularity === "day")
      .map((e) => String(e.occurredAt || "").slice(0, 10))
  );
  if (todayCount === 0 && !occupiedDayKeys.has(yesterday) && yesterday >= feed.recentCutoff) {
    if (!feed.recentEmptyDays.includes(yesterday)) {
      console.error("[test:tech-radar] fail: recentEmptyDays should include yesterday", feed.recentEmptyDays, yesterday);
      process.exit(1);
    }
  }
  const all = [...feed.recent, ...feed.archives];
  for (const entry of all) {
    const blob = `${entry.title} ${entry.brief} ${(entry.detailBlocks || []).map((b) => b.body).join(" ")}`;
    if (WEAK.test(blob)) {
      console.error("[test:tech-radar] fail: weak copy", entry.id);
      process.exit(1);
    }
    if (entry.granularity === "month" && PLACEHOLDER_ARCHIVE_RE.test(blob)) {
      console.error("[test:tech-radar] fail: placeholder archive", entry.id);
      process.exit(1);
    }
  }

  const may = feed.archives.find((e) => e.id === "tech-month-2026-05");
  if (may?.detailBlocks?.length) {
    const hasRealLink =
      may.detailBlocks.some((b) => b.sourceUrl && !/example\.com/i.test(b.sourceUrl)) ||
      (may.sources || []).some((s) => s.url && !/example\.com/i.test(s.url));
    if (!hasRealLink) {
      console.error("[test:tech-radar] fail: 2026-05 month should have real source links after enrich");
      process.exit(1);
    }
  }
  console.log(
    `[test:tech-radar] ok: recent=${feed.recent.length} archives=${feed.archives.length} materials=${feed.relatedMaterials.length}`
  );
}

main().catch((error) => {
  console.error("[test:tech-radar] error:", error);
  process.exit(1);
});
