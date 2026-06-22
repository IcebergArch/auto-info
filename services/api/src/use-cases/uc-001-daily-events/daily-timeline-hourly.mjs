/** 今日日报时间线：事件归集 + 按小时分桶 */

import { productDateTimeParts, todayProductKey } from "../../shared/utils.mjs";
import { presentEventForReport } from "./event-display.mjs";

export function collectReportEventsForTimeline(report = {}) {
  const strictSameDayOnly = report.presentation === "timeline" || report.date === todayProductKey();
  if (strictSameDayOnly && Array.isArray(report.events)) {
    return report.events.map((raw) => presentEventForReport(raw));
  }

  const map = new Map();

  const add = (raw) => {
    if (!raw?.id && !raw?.eventId) return;
    const id = raw.id || raw.eventId;
    if (map.has(id)) return;
    map.set(id, raw);
  };

  for (const event of report.events || []) add(event);
  for (const section of report.sections || []) {
    for (const event of section.events || []) add(event);
    for (const sub of section.subsections || []) {
      for (const event of sub.events || []) add(event);
    }
  }
  for (const block of Object.values(report.focusSections || {})) {
    if (!block || typeof block !== "object") continue;
    for (const event of block.events || []) add(event);
  }

  return [...map.values()].map((raw) => presentEventForReport(raw));
}

export function floorProductHour(iso) {
  if (!iso) return "";
  const parts = productDateTimeParts(iso);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:00`;
}

export function formatHourLabel(hourIso) {
  if (!hourIso) return "—";
  const match = String(hourIso).match(/^\d{4}-(\d{2})-(\d{2})T(\d{2}):00$/);
  if (!match) return "—";
  return `${Number(match[1])}.${match[2]} ${match[3]}:00`;
}

export function formatMinuteLabel(iso) {
  if (!iso) return "—";
  const parts = productDateTimeParts(iso);
  if (!parts) return "—";
  return `${parts.hour}:${parts.minute}`;
}

/**
 * @param {Array} timelineItems buildTimelineEntries 产物
 */
export function groupTimelineByHour(timelineItems = []) {
  const buckets = new Map();

  for (const item of timelineItems) {
    const hourKey = floorProductHour(item.at);
    if (!hourKey) continue;
    if (!buckets.has(hourKey)) {
      buckets.set(hourKey, { hourKey, hourLabel: formatHourLabel(hourKey), events: [] });
    }
    buckets.get(hourKey).events.push({
      ...item,
      minute: formatMinuteLabel(item.at)
    });
  }

  for (const bucket of buckets.values()) {
    bucket.events.sort(
      (a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()
    );
  }

  return [...buckets.values()].sort((a, b) => b.hourKey.localeCompare(a.hourKey));
}
