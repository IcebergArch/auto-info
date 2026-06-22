/**
 * 科技雷达统一时间线：
 * - 当年：按月折叠；月内已满自然周 → 周报卡，未满周 → 日卡
 * - 历史年：每年一个折叠节点，内含各月月报
 */

import {
  enrichMonthEntry,
  formatMonthDayLabel,
  monthPeriod,
  partitionTechRadarEntries,
  parseUtcDateKey
} from "./partition-radar.mjs";

function monthKeyFromEntry(entry) {
  return (
    entry.periodStart?.slice(0, 7) ||
    parseUtcDateKey(entry.occurredAt)?.slice(0, 7) ||
    entry.id?.replace(/^tech-month-/, "") ||
    entry.term?.slice(0, 7) ||
    ""
  );
}

function enumerateMonthKeys(fromMonthKey, toMonthKey) {
  const keys = [];
  let year = Number(fromMonthKey.slice(0, 4));
  let month = Number(fromMonthKey.slice(5, 7));
  const endYear = Number(toMonthKey.slice(0, 4));
  const endMonth = Number(toMonthKey.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

function formatMonthTitle(monthKey) {
  const m = Number(monthKey.slice(5, 7));
  return `${m}月`;
}

function sortEntriesDesc(a, b) {
  return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
}

function entryNode(entry) {
  return { kind: "entry", id: entry.id, entry };
}

/**
 * @param {Array} entries normalized
 * @param {string} today YYYY-MM-DD UTC
 */
export function buildTechRadarTimeline(entries, today) {
  const currentYear = today.slice(0, 4);
  const currentMonth = today.slice(0, 7);
  const { recent, archives, recentCutoff } = partitionTechRadarEntries(entries, today);

  const monthEntriesAll = entries
    .filter((e) => e.granularity === "month")
    .map((e) => enrichMonthEntry(e));

  const monthByKey = new Map();
  for (const entry of monthEntriesAll) {
    const mk = monthKeyFromEntry(entry);
    if (mk) monthByKey.set(mk, entry);
  }
  for (const entry of archives.filter((e) => e.granularity === "month")) {
    const mk = monthKeyFromEntry(entry);
    if (mk && !monthByKey.has(mk)) monthByKey.set(mk, enrichMonthEntry(entry));
  }

  const currentMonthLeaves = [...recent, ...archives.filter((e) => e.granularity !== "month")].sort(
    sortEntriesDesc
  );

  const timeline = [];
  const yearStartMonth = `${currentYear}-01`;
  const cyMonthKeys = enumerateMonthKeys(yearStartMonth, currentMonth);

  for (let i = cyMonthKeys.length - 1; i >= 0; i -= 1) {
    const mk = cyMonthKeys[i];
    if (mk === currentMonth) {
      const { periodStart, periodEnd } = monthPeriod(mk);
      timeline.push({
        kind: "month",
        id: `tr-month-${mk}`,
        label: formatMonthTitle(mk),
        periodStart,
        periodEnd,
        defaultExpanded: true,
        children: currentMonthLeaves.map(entryNode)
      });
      continue;
    }

    const entry = monthByKey.get(mk);
    if (!entry) continue;
    timeline.push({
      kind: "month",
      id: `tr-month-${mk}`,
      label: formatMonthTitle(mk),
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      periodLabel: entry.term,
      defaultExpanded: false,
      children: [entryNode(entry)]
    });
  }

  const histByYear = new Map();
  for (const entry of monthEntriesAll) {
    const mk = monthKeyFromEntry(entry);
    if (!mk || mk >= currentMonth) continue;
    const year = mk.slice(0, 4);
    if (year >= currentYear) continue;
    if (!histByYear.has(year)) histByYear.set(year, []);
    histByYear.get(year).push(entry);
  }

  const histYears = [...histByYear.keys()].sort((a, b) => b.localeCompare(a));
  for (const year of histYears) {
    const months = histByYear.get(year).sort(sortEntriesDesc);
    timeline.push({
      kind: "year",
      id: `tr-year-${year}`,
      label: `${year}年`,
      periodStart: `${year}-01-01`,
      periodEnd: `${year}-12-31`,
      defaultExpanded: false,
      children: months.map((entry) => {
        const mk = monthKeyFromEntry(entry);
        return {
          kind: "month",
          id: `tr-month-${mk}`,
          label: formatMonthTitle(mk),
          periodStart: entry.periodStart,
          periodEnd: entry.periodEnd,
          periodLabel: entry.term,
          defaultExpanded: false,
          children: [entryNode(entry)]
        };
      })
    });
  }

  if (!timeline.length && (recent.length || archives.length)) {
    timeline.push({
      kind: "month",
      id: `tr-month-${currentMonth}-fallback`,
      label: formatMonthTitle(currentMonth),
      periodStart: monthPeriod(currentMonth).periodStart,
      periodEnd: monthPeriod(currentMonth).periodEnd,
      defaultExpanded: true,
      children: [...recent, ...archives].sort(sortEntriesDesc).map(entryNode)
    });
  }

  return {
    timeline,
    recentCutoff,
    recentEnd: today,
    recentWindowDays: 5
  };
}

export function flattenTimelineEntries(timeline = []) {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.kind === "entry" && node.entry) out.push(node.entry);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(timeline);
  return out;
}

export function formatTimelineNodeRange(node) {
  if (node.periodLabel) return node.periodLabel;
  if (node.periodStart && node.periodEnd) {
    const start = formatMonthDayLabel(node.periodStart);
    const end = formatMonthDayLabel(node.periodEnd);
    return start === end ? start : `${start} — ${end}`;
  }
  return "";
}
