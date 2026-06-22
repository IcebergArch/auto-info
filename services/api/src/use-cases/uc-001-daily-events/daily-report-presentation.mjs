import { buildRefreshCutoffEntry } from "../../shared/timeline-refresh.mjs";
import { productDateTimeLabel, todayProductKey } from "../../shared/utils.mjs";
import { collectReportEventsForTimeline, groupTimelineByHour } from "./daily-timeline-hourly.mjs";
import { isWeakTimelineCopy, presentEventForReport, timelineDecisionScore } from "./event-display.mjs";

export const REPORT_LANES = [
  { key: "international", todayTitle: "国际", archivedTitle: "国际局势" },
  { key: "technology", todayTitle: "科技", archivedTitle: "科技" },
  { key: "finance", todayTitle: "金融", archivedTitle: "金融" },
  {
    key: "domestic",
    todayTitle: "国内",
    archivedTitle: "国内",
    description: "医疗、旅行、民生、媒体热点与中国本土关注"
  },
  { key: "other", todayTitle: "其他", archivedTitle: "其他" }
];

const LANE_TITLE = Object.fromEntries(REPORT_LANES.map((lane) => [lane.key, lane]));

export function laneTitle(key, presentation = "archived") {
  const lane = LANE_TITLE[key];
  if (!lane) return key;
  return presentation === "timeline" ? lane.todayTitle : lane.archivedTitle;
}

function eventSourceUrl(event) {
  const fromRef = (event.references || []).find((ref) => ref?.url)?.url;
  if (fromRef) return fromRef;
  if (/^https?:\/\//i.test(String(event.title || "").trim())) return String(event.title).trim();
  return "";
}

function hasValidOccurredAt(iso) {
  if (!iso || !String(iso).trim()) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime());
}

function formatTimeLabel(iso) {
  if (!hasValidOccurredAt(iso)) return "";
  return productDateTimeLabel(iso);
}

/** 今日时间线：有时间的条目按 occurredAt 倒序（最新在上），无时间排末尾 */
export function sortTimelineEntriesDesc(items = []) {
  return items.slice().sort((a, b) => {
    if (a.isRefreshCutoff && !b.isRefreshCutoff) return -1;
    if (!a.isRefreshCutoff && b.isRefreshCutoff) return 1;
    const aUndated = Boolean(a.undated) || !a.at;
    const bUndated = Boolean(b.undated) || !b.at;
    if (aUndated && bUndated) return 0;
    if (aUndated) return 1;
    if (bUndated) return -1;
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });
}

/** 时间线顶部的「截至上次更新」锚点（倒序时排在最上） */
export function buildReportRefreshCutoffEntry(report, eventCount = 0) {
  return buildRefreshCutoffEntry({
    date: report.date || report.generatedAt?.slice(0, 10),
    refreshedAt: report.generatedAt,
    itemCount: eventCount,
    domain: "daily"
  });
}

export { buildRefreshCutoffEntry };

export function buildTimelineEntries(events, classifyReportBlock) {
  return events
    .map((raw) => presentEventForReport(raw))
    .slice()
    .sort((a, b) => timelineDecisionScore(b) - timelineDecisionScore(a) || new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0))
    .map((event) => {
      const lane = classifyReportBlock(event);
      const desc = String(event.desc || event.summary || "").trim();
      const undated = !hasValidOccurredAt(event.occurredAt);
      return {
        id: event.id,
        eventId: event.id,
        at: undated ? undefined : event.occurredAt,
        undated,
        time: undated ? "" : formatTimeLabel(event.occurredAt),
        lane,
        laneTitle: laneTitle(lane, "timeline"),
        title: event.title,
        displayTitle: event.displayTitle || event.title,
        desc,
        url: eventSourceUrl(event),
        category: event.category,
        region: event.region,
        severity: event.severity,
        special: event.special
      };
    })
    .filter((item) => !isWeakTimelineCopy(item.displayTitle, item.desc));
}

export function buildRelatedMaterials(events, references = []) {
  const seen = new Set();
  const items = [];

  for (const ref of references) {
    const url = String(ref.url || "").trim();
    const key = url || ref.id || ref.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: ref.id || key,
      eventId: ref.eventId,
      title: ref.title || url || "来源",
      url,
      source: ref.source,
      provider: ref.provider,
      occurredAt: ref.occurredAt
    });
  }

  for (const event of events) {
    const url = eventSourceUrl(event);
    const key = url || event.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: `mat-${event.id}`,
      eventId: event.id,
      title: event.displayTitle || event.title,
      url,
      source: event.category,
      provider: "event",
      occurredAt: event.occurredAt
    });
  }

  return items.sort((a, b) => new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));
}

export function attachTodayTimeline(report, classifyReportBlock, refreshIntervalHours = 3) {
  const hours = Math.max(1, Number(refreshIntervalHours) || 3);
  const sourceEvents = collectReportEventsForTimeline(report);
  const eventTimeline = sortTimelineEntriesDesc(
    buildTimelineEntries(sourceEvents, classifyReportBlock)
  );
  const refreshCutoff = buildReportRefreshCutoffEntry(report, eventTimeline.length);
  const timeline = [refreshCutoff, ...eventTimeline];
  const timelineHours = groupTimelineByHour(eventTimeline);
  const nextRefreshAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  return {
    ...report,
    presentation: "timeline",
    refreshIntervalHours: hours,
    nextRefreshAt,
    lastRefreshedAt: report.generatedAt,
    timeline,
    timelineHours,
    timelineByLane: Object.fromEntries(
      REPORT_LANES.map((lane) => [
        lane.key,
        sortTimelineEntriesDesc(
          eventTimeline.filter((item) => item.lane === lane.key && !item.isRefreshCutoff)
        )
      ])
    ),
    relatedMaterials: buildRelatedMaterials(sourceEvents, report.references || [])
  };
}

export function compressTimelineToArchived(report, builders) {
  if (report.presentation !== "timeline") return report;
  const events = (report.events || []).length
    ? report.events
    : (report.timeline || []).map((item) => ({
        id: item.eventId || item.id,
        title: item.title,
        displayTitle: item.displayTitle,
        summary: item.desc,
        desc: item.desc,
        category: item.category,
        region: item.region,
        occurredAt: item.at,
        severity: item.severity,
        references: item.url ? [{ url: item.url, title: item.title }] : []
      }));

  const { buildFocusSections, buildReportOverview, buildReportLayouts, reviewReport } = builders;
  const focusSections = buildFocusSections(events);
  const overview = buildReportOverview(report.date, events, focusSections, report.eventWindow);
  const compressed = {
    ...report,
    presentation: "archived",
    events,
    focusSections,
    overview,
    reportLayouts: buildReportLayouts(events, overview, focusSections),
    timeline: undefined,
    timelineHours: undefined,
    timelineByLane: undefined,
    relatedMaterials: undefined,
    nextRefreshAt: undefined,
    refreshIntervalHours: undefined
  };
  compressed.review = reviewReport(compressed);
  return compressed;
}

export function shouldUseTimelinePresentation(date) {
  return date === todayProductKey();
}
