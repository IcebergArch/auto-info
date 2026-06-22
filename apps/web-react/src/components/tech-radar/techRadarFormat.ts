import type { TechRadarEntry } from "./types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatDateKeyMd(dateKey: string) {
  const [, month, day] = dateKey.split("-");
  if (!month || !day) return dateKey;
  return `${Number(month)}.${pad(Number(day))}`;
}

function lastDayOfMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function entryDate(entry: TechRadarEntry) {
  const d = new Date(entry.occurredAt);
  return Number.isNaN(d.getTime()) ? null : d;
}

function utcDateKey(date: Date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function formatLocalHourMinute(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatLocalHourMinuteFromIso(iso?: string) {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "—";
  return formatLocalHourMinute(d);
}

export function isEntryOnToday(entry: TechRadarEntry) {
  const d = entryDate(entry);
  if (!d) return false;
  return utcDateKey(d) === utcDateKey(new Date());
}

export function formatEntryDayLabel(entry: TechRadarEntry) {
  const d = entryDate(entry);
  if (!d) return "—";
  const now = new Date();
  const sameYear = d.getUTCFullYear() === now.getUTCFullYear();
  if (sameYear) {
    return `${d.getUTCMonth() + 1}.${pad(d.getUTCDate())}`;
  }
  return `${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** 条目展示周期（月：整月；周：周一至周日；日：单日） */
export function formatEntryPeriodLabel(entry: TechRadarEntry) {
  if (entry.periodStart && entry.periodEnd) {
    const start = formatDateKeyMd(entry.periodStart);
    const end = formatDateKeyMd(entry.periodEnd);
    return start === end ? start : `${start} — ${end}`;
  }
  if (entry.granularity === "month") {
    const monthKey = entry.occurredAt?.slice(0, 7) || entry.term?.slice(0, 7);
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) {
      const start = `${monthKey}-01`;
      const end = lastDayOfMonth(monthKey);
      return `${formatDateKeyMd(start)} — ${formatDateKeyMd(end)}`;
    }
  }
  if (entry.granularity === "day" && isEntryOnToday(entry)) {
    const d = entryDate(entry);
    return d ? formatLocalHourMinute(d) : "—";
  }
  return formatRadarTimeLabel(entry);
}

/** 关联日报日期列表 → 起止 */
export function formatDateKeysRange(dateKeys: string[]) {
  const keys = [...dateKeys].filter(Boolean).sort();
  if (!keys.length) return "";
  const start = formatDateKeyMd(keys[0]);
  const end = formatDateKeyMd(keys[keys.length - 1]);
  return start === end ? start : `${start} — ${end}`;
}

/** 分区列表起止（优先 periodStart/End） */
export function formatEntryRangeLabel(entries: TechRadarEntry[]) {
  if (!entries.length) return "";
  const starts = entries.map((e) => e.periodStart || e.occurredAt?.slice(0, 10)).filter(Boolean);
  const ends = entries.map((e) => e.periodEnd || e.occurredAt?.slice(0, 10)).filter(Boolean);
  if (!starts.length || !ends.length) return "";
  const start = formatDateKeyMd(starts.sort()[0]);
  const end = formatDateKeyMd(ends.sort().slice(-1)[0]);
  return start === end ? start : `${start} — ${end}`;
}

export function formatRadarTimeLabel(entry: TechRadarEntry) {
  if (entry.granularity === "month" || entry.granularity === "week") {
    return formatEntryPeriodLabel(entry);
  }
  if (isEntryOnToday(entry)) {
    const d = entryDate(entry);
    return d ? formatLocalHourMinute(d) : "—";
  }
  return formatEntryDayLabel(entry);
}

export function formatRadarStatusMarker(entry: TechRadarEntry) {
  return entry.status === "open" || entry.status === "archived" ? "○" : "·";
}

const KIND_LABELS: Record<string, string> = {
  paper: "论文",
  论文: "论文",
  concept: "概念",
  概念: "概念",
  Agent: "热词",
  agent: "热词",
  Cursor: "热词",
  自动化: "热词",
  工程: "热词"
};

export function formatRadarKindPill(entry: TechRadarEntry) {
  if (entry.granularity === "month") return "月报";
  if (entry.granularity === "week") return "周报";
  const tag = entry.tags?.[0];
  if (!tag) return "热词";
  return KIND_LABELS[tag] || (tag.length <= 6 ? tag : "热词");
}

/** @deprecated */
export function formatRadarHeadline(entry: TechRadarEntry) {
  const marker = formatRadarStatusMarker(entry);
  return `${formatEntryPeriodLabel(entry)} ${marker} — ${entry.title}`;
}
