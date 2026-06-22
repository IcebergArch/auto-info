export function nowIso() {
  return new Date().toISOString();
}

export function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function safeSlug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || `evt-${Date.now()}`;
}

export function toDateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function todayUtcKey() {
  return dateKey(new Date());
}

export const PRODUCT_TIME_ZONE = "Asia/Shanghai";

const PRODUCT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PRODUCT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const PRODUCT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PRODUCT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

function dateTimeParts(formatter, value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = Object.fromEntries(
    formatter.formatToParts(d)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute
  };
}

export function productDateTimeParts(value) {
  if (value == null || value === "") return null;
  return dateTimeParts(PRODUCT_DATE_TIME_FORMATTER, value);
}

export function productDateKey(value) {
  if (value == null || value === "") return "";
  const parts = dateTimeParts(PRODUCT_DATE_FORMATTER, value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

export function todayProductKey() {
  return productDateKey(new Date());
}

export function productClockLabel(value = new Date()) {
  const parts = productDateTimeParts(value);
  if (!parts) return "—";
  return `${parts.hour}:${parts.minute}`;
}

export function productDateTimeLabel(value = new Date()) {
  const parts = productDateTimeParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function timeZoneOffsetMs(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

function zonedTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  const localAsUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const firstOffset = timeZoneOffsetMs(localAsUtc, timeZone);
  let utc = new Date(localAsUtc.getTime() - firstOffset);
  const secondOffset = timeZoneOffsetMs(utc, timeZone);
  if (secondOffset !== firstOffset) {
    utc = new Date(localAsUtc.getTime() - secondOffset);
  }
  return utc;
}

export function addDateKeyDays(dateKeyValue, days) {
  const match = String(dateKeyValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return todayProductKey();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function productDayUtcWindow(dateKeyValue) {
  const match = String(dateKeyValue || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const nextKey = addDateKeyDays(dateKeyValue, 1);
  const next = nextKey.match(/^(\d{4})-(\d{2})-(\d{2})$/).slice(1).map(Number);
  const start = zonedTimeToUtc(year, month, day, 0, 0, 0, PRODUCT_TIME_ZONE);
  const end = zonedTimeToUtc(next[0], next[1], next[2], 0, 0, 0, PRODUCT_TIME_ZONE);
  const stamp = (date) => date.toISOString().replace(/[-:T]/g, "").replace(/\.\d{3}Z$/, "");
  return {
    date: dateKeyValue,
    timeZone: PRODUCT_TIME_ZONE,
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    searchFrom: start.toISOString().slice(0, 10),
    searchTo: addDateKeyDays(end.toISOString().slice(0, 10), 1),
    startDateTime: stamp(start),
    endDateTime: stamp(end)
  };
}

/** 日报展示标题：仅「产品今日」为「今日日报」，历史日期不得沿用归档时的「今日日报」 */
export function capReportDateKey(dateKey) {
  const key = String(dateKey || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0];
  if (!key) return todayProductKey();
  const today = todayProductKey();
  return key > today ? today : key;
}

export function reportDisplayTitle(date, storedTitle = "") {
  const key = String(date || "").match(/^\d{4}-\d{2}-\d{2}$/)?.[0] || todayProductKey();
  if (key === todayProductKey()) return "今日日报";
  const raw = String(storedTitle || "").trim();
  if (raw && raw !== "今日日报" && raw !== "今日" && !/^今日日报/.test(raw)) {
    return raw;
  }
  return `${key} 日报`;
}

export function dedupeByAt(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.at}|${item.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toTimelineLabel(pointAt, baseDate) {
  const d = new Date(pointAt);
  const days = Math.round((baseDate.getTime() - d.getTime()) / (24 * 3600 * 1000));
  if (days <= 0) return "今日";
  if (days <= 1) return "T-1 天";
  return `T-${days} 天`;
}

export function inDateRange(iso, fromDate, toDate) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (fromDate && t < fromDate.getTime()) return false;
  if (toDate && t > toDate.getTime()) return false;
  return true;
}

export function clampRange(fromDate, toDate) {
  const maxDays = 90;
  if (!fromDate || !toDate) return { fromDate, toDate };
  const ms = toDate.getTime() - fromDate.getTime();
  const days = Math.ceil(ms / (24 * 3600 * 1000));
  if (days <= maxDays) return { fromDate, toDate };
  return {
    fromDate: new Date(toDate.getTime() - maxDays * 24 * 3600 * 1000),
    toDate
  };
}

export function parseTagsParam(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[,，]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
