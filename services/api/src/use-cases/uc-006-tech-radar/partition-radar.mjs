/** 科技雷达 feed 分区：近 5 日 / 当月已满周压缩 / 过去 5 个月报 */

export const RECENT_DAYS = 5;
export const PAST_MONTH_ARCHIVE_COUNT = 5;

export function parseUtcDateKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function daysBetweenUtc(dateKeyA, dateKeyB) {
  const a = new Date(`${dateKeyA}T00:00:00.000Z`).getTime();
  const b = new Date(`${dateKeyB}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

export function addUtcDays(dateKey, delta) {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** 自 toKey 向 fromKey 倒序枚举 UTC 日期（含端点） */
export function enumerateUtcDateKeysDesc(fromKey, toKey) {
  const keys = [];
  let cur = toKey;
  while (cur && cur >= fromKey) {
    keys.push(cur);
    if (cur === fromKey) break;
    cur = addUtcDays(cur, -1);
  }
  return keys;
}

/** 近窗口内无 day 条目的日期（不含 today，today 由 refreshCutoff 展示） */
export function listRecentEmptyDayKeys(today, entryDateKeys = [], cutoff) {
  const occupied = new Set(entryDateKeys.filter(Boolean));
  return enumerateUtcDateKeysDesc(cutoff, today).filter(
    (dateKey) => dateKey !== today && !occupied.has(dateKey)
  );
}

export function lastDayOfMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

export function monthPeriod(monthKey) {
  return {
    periodStart: `${monthKey}-01`,
    periodEnd: lastDayOfMonth(monthKey)
  };
}

/** 展示用：6.07（UTC） */
export function formatMonthDayLabel(dateKey) {
  if (!dateKey) return "—";
  const [, month, day] = dateKey.split("-");
  return `${Number(month)}.${String(day).padStart(2, "0")}`;
}

/** 该 UTC 日期所在自然周周日（周结束日） */
export function weekEndSundayKey(dateKey) {
  const d = new Date(`${dateKey}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  const end = new Date(d);
  if (dow === 0) {
    end.setUTCDate(d.getUTCDate());
  } else {
    end.setUTCDate(d.getUTCDate() + (7 - dow));
  }
  return end.toISOString().slice(0, 10);
}

function recentCutoffDateKey(today) {
  const d = new Date(`${today}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - (RECENT_DAYS - 1));
  return d.toISOString().slice(0, 10);
}

function buildWeekEntry(weekEndKey, dayEntries) {
  const periodStart = addUtcDays(weekEndKey, -6);
  const sorted = [...dayEntries].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );
  const titles = sorted.map((e) => e.title).filter(Boolean);
  const title =
    titles.length >= 2
      ? `${titles[0]}、${titles[1]}${titles.length > 2 ? " 等" : ""}`
      : titles[0] || `${formatMonthDayLabel(periodStart)} — ${formatMonthDayLabel(weekEndKey)}`;
  const brief = sorted[0]?.brief || `本周共 ${sorted.length} 条科技向更新。`;
  const sources = [];
  const seen = new Set();
  for (const entry of sorted) {
    for (const s of entry.sources || []) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      sources.push(s);
    }
  }
  const detailBlocks = sorted.slice(0, 4).map((e) => ({
    label: formatMonthDayLabel(parseUtcDateKey(e.occurredAt)),
    body: e.brief || e.title,
    sourceUrl: e.sources?.[0]?.url,
    sourceTitle: e.sources?.[0]?.title
  }));

  return {
    ...sorted[0],
    id: `tech-week-${weekEndKey}`,
    term: `${formatMonthDayLabel(periodStart)} — ${formatMonthDayLabel(weekEndKey)}`,
    title,
    brief,
    granularity: "week",
    status: "archived",
    occurredAt: `${weekEndKey}T23:59:59.000Z`,
    periodStart,
    periodEnd: weekEndKey,
    tags: [...new Set([...(sorted[0]?.tags || []), "周报"])],
    sources: sources.slice(0, 12),
    detailBlocks: detailBlocks.length ? detailBlocks : sorted[0]?.detailBlocks,
    briefingSessionId: null,
    relatedReportDates: undefined
  };
}

export function enrichMonthEntry(entry) {
  const monthKey =
    entry.id?.replace(/^tech-month-/, "") ||
    parseUtcDateKey(entry.occurredAt)?.slice(0, 7) ||
    entry.term?.slice(0, 7);
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return entry;
  const { periodStart, periodEnd } = monthPeriod(monthKey);
  return {
    ...entry,
    periodStart,
    periodEnd,
    term: `${formatMonthDayLabel(periodStart)} — ${formatMonthDayLabel(periodEnd)}`,
    relatedReportDates: undefined
  };
}

/**
 * @param {Array} entries normalized entries
 * @param {string} today YYYY-MM-DD UTC
 */
export function partitionTechRadarEntries(entries, today) {
  const currentMonth = today.slice(0, 7);
  const cutoff = recentCutoffDateKey(today);
  const dayEntries = [];
  const monthEntries = [];

  for (const entry of entries) {
    if (entry.granularity === "month") monthEntries.push(enrichMonthEntry(entry));
    else if (entry.granularity === "week") {
      /* 周节点由日条目重算 */
    } else {
      dayEntries.push(entry);
    }
  }

  const recent = [];
  const archiveDays = [];
  const weekBuckets = new Map();

  for (const entry of dayEntries) {
    const dateKey = parseUtcDateKey(entry.occurredAt);
    if (!dateKey) continue;
    const ageDays = daysBetweenUtc(dateKey, today);
    if (ageDays < 0) continue;

    if (ageDays < RECENT_DAYS) {
      recent.push(entry);
      continue;
    }

    if (!dateKey.startsWith(currentMonth)) continue;

    const weekEnd = weekEndSundayKey(dateKey);
    if (weekEnd > today) {
      archiveDays.push(entry);
      continue;
    }

    if (!weekBuckets.has(weekEnd)) weekBuckets.set(weekEnd, []);
    weekBuckets.get(weekEnd).push(entry);
  }

  const weekArchives = [...weekBuckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekKey, list]) => buildWeekEntry(weekKey, list));

  const pastMonthArchives = monthEntries
    .filter((e) => {
      const monthKey = e.periodStart?.slice(0, 7) || parseUtcDateKey(e.occurredAt)?.slice(0, 7);
      return monthKey && monthKey < currentMonth;
    })
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, PAST_MONTH_ARCHIVE_COUNT);

  const archives = [...weekArchives, ...archiveDays, ...pastMonthArchives];

  const byDesc = (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  recent.sort(byDesc);
  archives.sort(byDesc);

  return { recent, archives, recentCutoff: cutoff };
}
