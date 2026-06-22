import { isWeakTimelineCopy } from "../uc-001-daily-events/event-decision-copy.mjs";
import { getRefreshIntervalHours } from "../../shared/product-config.mjs";
import { readReadingStore } from "../../shared/store.mjs";
import { emptySourceStatus } from "../../shared/source-status.mjs";
import { buildRefreshCutoffEntry } from "../../shared/timeline-refresh.mjs";
import { nowIso, todayUtcKey } from "../../shared/utils.mjs";
import {
  detailBlocksNeedSourceLinks,
  enrichEntriesList,
  enrichMonthArchiveEntry,
  isPlaceholderArchiveEntry,
  needsSourceRefresh,
  PLACEHOLDER_ARCHIVE_RE
} from "./archive-enrich.mjs";
import { prioritizeRadarEntries } from "./big-tech-focus.mjs";
import { listRecentEmptyDayKeys, parseUtcDateKey, partitionTechRadarEntries } from "./partition-radar.mjs";
import { buildTechRadarTimeline, flattenTimelineEntries } from "./timeline-radar.mjs";
import { mutateTechRadarStore, readTechRadarStore } from "./store.mjs";

function normalizeEntry(raw = {}) {
  const id = String(raw.id || "").trim();
  const term = String(raw.term || "").trim();
  const title = String(raw.title || "").trim();
  const brief = String(raw.brief || "").trim();
  const granularity =
    raw.granularity === "month" ? "month" : raw.granularity === "week" ? "week" : "day";
  const status =
    raw.status === "settled" || raw.status === "archived" || raw.status === "open"
      ? raw.status
      : granularity === "month"
        ? "archived"
        : "open";
  const occurredAt = raw.occurredAt || nowIso();
  return {
    id: id || `tech-${term.replace(/\s+/g, "-")}-${parseUtcDateKey(occurredAt) || todayUtcKey()}`,
    term: term || title.slice(0, 40),
    title,
    brief,
    status,
    granularity,
    occurredAt,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    briefingSessionId: raw.briefingSessionId ? String(raw.briefingSessionId) : null,
    sources: Array.isArray(raw.sources)
      ? raw.sources.map((s) => ({
          title: String(s.title || s.url || "来源"),
          url: String(s.url || ""),
          provider: s.provider ? String(s.provider) : "web"
        }))
      : [],
    detailBlocks: Array.isArray(raw.detailBlocks)
      ? raw.detailBlocks.map((b) => ({
          label: String(b.label || "详情"),
          body: String(b.body || ""),
          sourceUrl: b.sourceUrl ? String(b.sourceUrl) : undefined,
          sourceTitle: b.sourceTitle ? String(b.sourceTitle) : undefined
        }))
      : undefined,
    relatedReportDates: Array.isArray(raw.relatedReportDates)
      ? raw.relatedReportDates.map(String)
      : undefined,
    periodStart: raw.periodStart ? String(raw.periodStart).slice(0, 10) : undefined,
    periodEnd: raw.periodEnd ? String(raw.periodEnd).slice(0, 10) : undefined
  };
}

function validateCopy(entry) {
  if (!entry.title || !entry.brief) {
    return { error: "title 与 brief 为必填" };
  }
  if (isWeakTimelineCopy(entry.title, entry.brief)) {
    return { error: "标题或简述不符合科技雷达文案质量要求" };
  }
  if (PLACEHOLDER_ARCHIVE_RE.test(`${entry.brief} ${(entry.detailBlocks || []).map((b) => b.body).join(" ")}`)) {
    return { error: "月归档不得使用回溯占位文案，请先充实日报或使用 repair-archives" };
  }
  return null;
}

function partitionEntries(entries) {
  return partitionTechRadarEntries(entries, todayUtcKey());
}

function materialsForEntry(entry) {
  if (!entry) return [];
  return (entry.sources || []).map((s, index) => ({
    id: `${entry.id}-src-${index}`,
    entryId: entry.id,
    title: s.title,
    url: s.url,
    provider: s.provider || "web"
  }));
}

export async function listTechRadarFeed(searchParams) {
  const store = await readTechRadarStore();
  let entries = prioritizeRadarEntries(
    store.entries.map(normalizeEntry).filter((e) => e.title && e.brief)
  );

  if (
    entries.some(
      (e) =>
        e.granularity === "month" &&
        (isPlaceholderArchiveEntry(e) ||
          needsSourceRefresh(e) ||
          detailBlocksNeedSourceLinks(e) ||
          PLACEHOLDER_ARCHIVE_RE.test(`${e.title} ${e.brief}`))
    )
  ) {
    const { entries: enriched, repaired } = await enrichEntriesList(entries, { force: false });
    entries = enriched;
    if (repaired > 0) {
      await mutateTechRadarStore((draft) => {
        draft.entries = enriched;
        return draft;
      });
    }
  }

  const { recent, archives, recentCutoff } = partitionEntries(entries);
  const { timeline, recentEnd, recentWindowDays } = buildTechRadarTimeline(entries, todayUtcKey());
  const flat = flattenTimelineEntries(timeline);

  const entryId = searchParams.get("entryId") || "";
  const selected = entryId
    ? flat.find((e) => e.id === entryId) || [...recent, ...archives].find((e) => e.id === entryId) || null
    : flat[0] || archives[0] || recent[0] || null;

  const refreshIntervalHours = await getRefreshIntervalHours();
  const lastRefreshedAt = nowIso();
  const today = todayUtcKey();
  const dayEntryDateKeys = entries
    .filter((e) => e.granularity === "day")
    .map((e) => parseUtcDateKey(e.occurredAt))
    .filter(Boolean);
  const todayEntryCount = dayEntryDateKeys.filter((dateKey) => dateKey === today).length;
  const todayWindow = {
    date: today,
    startAt: `${today}T00:00:00.000Z`,
    endAt: lastRefreshedAt,
    entryCount: todayEntryCount,
    status: emptySourceStatus({ eventCount: todayEntryCount })
  };
  const refreshCutoff = buildRefreshCutoffEntry({
    date: today,
    refreshedAt: lastRefreshedAt,
    itemCount: todayEntryCount,
    domain: "tech-radar",
    idPrefix: "tech-radar-refresh-cutoff"
  });
  const recentEmptyDays = listRecentEmptyDayKeys(today, dayEntryDateKeys, recentCutoff);
  const nextRefreshAt = new Date(
    new Date(lastRefreshedAt).getTime() + refreshIntervalHours * 60 * 60 * 1000
  ).toISOString();

  return {
    timeline,
    recent,
    archives,
    relatedMaterials: materialsForEntry(selected),
    selectedEntryId: selected?.id || null,
    refreshIntervalHours,
    lastRefreshedAt,
    todayWindow,
    refreshCutoff,
    recentEmptyDays,
    nextRefreshAt,
    recentWindowDays,
    recentCutoff,
    recentEnd
  };
}

export async function upsertTechRadarEntry(body = {}) {
  const entry = normalizeEntry(body);
  const copyError = validateCopy(entry);
  if (copyError) return copyError;

  if (entry.briefingSessionId) {
    try {
      const history = await readReadingStore();
      const found = (history.sessions || []).some(
        (s) => String(s.sessionId || s.id) === entry.briefingSessionId
      );
      if (!found) {
        entry._briefingWarning = "briefingSessionId 未在阅读历史中命中";
      }
    } catch {
      // ignore
    }
  }

  await mutateTechRadarStore((store) => {
    const list = store.entries || [];
    const index = list.findIndex((e) => e.id === entry.id);
    if (index >= 0) list[index] = entry;
    else list.push(entry);
    store.entries = list;
    return store;
  });

  const warning = entry._briefingWarning;
  delete entry._briefingWarning;
  return { ok: true, entry, warning: warning || undefined };
}

function enumerateMonthKeys(fromMonth, toMonth) {
  const months = [];
  let year = Number(fromMonth.slice(0, 4));
  let month = Number(fromMonth.slice(5, 7));
  const endYear = Number(toMonth.slice(0, 4));
  const endMonth = Number(toMonth.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

export async function backfillTechRadarArchives(body = {}) {
  const fromMonth = String(body.fromMonth || "2025-12")
    .trim()
    .match(/^(\d{4}-\d{2})/)?.[1];
  const toMonth = String(body.toMonth || todayUtcKey().slice(0, 7))
    .trim()
    .match(/^(\d{4}-\d{2})/)?.[1];
  if (!fromMonth || !toMonth) {
    return { error: "fromMonth / toMonth 须为 YYYY-MM" };
  }

  const months = enumerateMonthKeys(fromMonth, toMonth);
  const store = await readTechRadarStore();
  const existingIds = new Set((store.entries || []).map((e) => e.id));
  const currentMonth = todayUtcKey().slice(0, 7);
  const createdEntries = [];

  for (const month of months) {
    if (month === currentMonth) continue;
    const id = `tech-month-${month}`;
    if (existingIds.has(id)) continue;
    let entry = normalizeEntry({
      id,
      term: month,
      title: `${month.slice(0, 4)}年${month.slice(5, 7)}月 AI 概念与工程热词综述`,
      brief: `${month} 月 AI 科技动态月报（待从日报充实）。`,
      status: "archived",
      granularity: "month",
      occurredAt: `${month}-01T00:00:00.000Z`,
      tags: ["月报", "自动补齐"],
      detailBlocks: [],
      sources: []
    });
    entry = await enrichMonthArchiveEntry(entry);
    const copyError = validateCopy(entry);
    if (copyError) continue;
    createdEntries.push(entry);
    existingIds.add(id);
  }

  if (createdEntries.length) {
    await mutateTechRadarStore((draft) => {
      draft.entries = [...(draft.entries || []), ...createdEntries];
      return draft;
    });
  }

  return {
    ok: true,
    fromMonth,
    toMonth,
    months,
    created: createdEntries.length,
    entries: createdEntries
  };
}

export async function repairTechRadarArchives(body = {}) {
  const store = await readTechRadarStore();
  const entries = store.entries.map(normalizeEntry);
  const { entries: enriched, repaired } = await enrichEntriesList(entries, {
    force: body.force === true
  });

  if (repaired > 0 || body.force) {
    await mutateTechRadarStore((draft) => {
      draft.entries = enriched;
      return draft;
    });
  }

  return {
    ok: true,
    repaired,
    total: enriched.length,
    archives: enriched.filter((e) => e.granularity === "month").length
  };
}
