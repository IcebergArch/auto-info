import { useMemo, useState } from "react";
import { DailyReportOverviewPanels } from "./DailyReportOverviewPanels";
import { ReportSection } from "./report/ReportSection";
import { SourceJumpLink } from "./report/SourceJumpLink";
import {
  EventTimeline,
  sortTimelineItemsDesc,
  timelineRangeFromItems,
  type EventTimelineItem
} from "./report/EventTimeline";
import { normalizeOverviewSummary } from "../lib/reportOverview";
import { productDateKey } from "../lib/productDate";
import { reportStatusMessage, type ReportStatus } from "../lib/reportStatus";
import type { DailyReportDetailData } from "./DailyReportDetail";

type TimelineItem = EventTimelineItem & {
  lane?: string;
  displayTitle?: string;
  desc?: string;
  time?: string;
  undated?: boolean;
  isRefreshCutoff?: boolean;
};

type RelatedMaterial = {
  id?: string;
  title?: string;
  url?: string;
  source?: string;
  provider?: string;
};

export type DailyReportTimelineData = DailyReportDetailData & {
  presentation?: "timeline";
  timeline?: TimelineItem[];
  timelineByLane?: Record<string, TimelineItem[]>;
  relatedMaterials?: RelatedMaterial[];
  nextRefreshAt?: string;
  lastRefreshedAt?: string;
  refreshIntervalHours?: number;
  status?: ReportStatus;
};

const LANES = [
  { key: "international", title: "国际" },
  { key: "technology", title: "科技" },
  { key: "finance", title: "金融" },
  { key: "domestic", title: "国内" },
  { key: "other", title: "其他" }
];

function formatRefreshHint(nextRefreshAt?: string) {
  if (!nextRefreshAt) return "";
  const d = new Date(nextRefreshAt);
  if (Number.isNaN(d.getTime())) return "";
  return `下次刷新 ${d.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatClock(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function timelineFreshnessMeta(entries: EventTimelineItem[]) {
  const latest = entries
    .filter((item) => item.at)
    .map((item) => new Date(item.at as string))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  return latest || null;
}

function toTimelineEntries(items: TimelineItem[]): EventTimelineItem[] {
  return items.map((item) => ({
    id: item.id,
    at: item.at,
    undated: item.undated,
    isRefreshCutoff: item.isRefreshCutoff,
    timestamp: item.time,
    title: item.displayTitle || item.title || "",
    summary: item.desc,
    laneTitle: item.laneTitle,
    url: item.url
  }));
}

function countTimelineEvents(items: TimelineItem[]) {
  return items.filter((item) => !item.isRefreshCutoff).length;
}

export function DailyReportTimeline({ report }: { report: DailyReportTimelineData }) {
  const [laneFilter, setLaneFilter] = useState<string>("all");
  const bullets = (report.overview?.bullets || []).filter(Boolean);
  const timeline = report.timeline || [];
  const materials = report.relatedMaterials || [];

  const reportDate = report.date || "";
  const eventCount = countTimelineEvents(timeline);

  const entries = useMemo(() => {
    const sameDay =
      laneFilter === "all"
        ? timeline
        : timeline.filter((item) => item.isRefreshCutoff || item.lane === laneFilter);
    const onDate = reportDate
        ? sameDay.filter(
          (item) =>
            item.isRefreshCutoff || productDateKey(item.at || "") === reportDate || item.undated
        )
      : sameDay;
    return sortTimelineItemsDesc(toTimelineEntries(onDate));
  }, [laneFilter, reportDate, timeline]);

  const displayEntries = entries.filter((item) => !item.isRefreshCutoff);
  const summaryText = useMemo(
    () => normalizeOverviewSummary(report.overview?.summary || "", reportDate, eventCount),
    [eventCount, report.overview?.summary, reportDate]
  );

  const rangeLabel = timelineRangeFromItems(displayEntries);
  const refreshedAtLabel = formatClock(report.lastRefreshedAt);
  const latestEventAt = timelineFreshnessMeta(displayEntries);
  const latestEventLabel = latestEventAt
    ? latestEventAt.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const nextRefresh = report.nextRefreshAt ? new Date(report.nextRefreshAt) : null;
  const nextRefreshOverdue = Boolean(nextRefresh && !Number.isNaN(nextRefresh.getTime()) && Date.now() > nextRefresh.getTime());
  const statusMessage = reportStatusMessage(report.status);
  const freshnessHint = !displayEntries.length
    ? refreshedAtLabel
      ? `上次刷新 ${refreshedAtLabel}，${statusMessage}`
      : statusMessage
    : refreshedAtLabel && latestEventLabel
      ? `上次刷新 ${refreshedAtLabel}；最新事件 ${latestEventLabel}。${nextRefreshOverdue ? "已超过计划刷新时间，可点击“刷新当日”。" : ""}`
      : refreshedAtLabel
        ? `上次刷新 ${refreshedAtLabel}。`
        : latestEventLabel
          ? `最新事件 ${latestEventLabel}。`
          : "";

  return (
    <div className="report-document daily-report-timeline">
      <ReportSection title="概要" defaultOpen>
        <DailyReportOverviewPanels
          summary={summaryText}
          panels={report.overview?.panels}
          bullets={bullets}
          footer={
            report.refreshIntervalHours ? (
              <p className="report-meta-hint">{formatRefreshHint(report.nextRefreshAt)}</p>
            ) : null
          }
        />
      </ReportSection>

      <ReportSection title="时间线" range={rangeLabel} count={displayEntries.length} defaultOpen>
        <div className="timeline-lane-tabs" role="tablist" aria-label="分栏筛选">
          <button
            type="button"
            className={`timeline-lane-tab${laneFilter === "all" ? " is-active" : ""}`}
            onClick={() => setLaneFilter("all")}
          >
            全部
          </button>
          {LANES.map((lane) => (
            <button
              key={lane.key}
              type="button"
              className={`timeline-lane-tab${laneFilter === lane.key ? " is-active" : ""}`}
              onClick={() => setLaneFilter(lane.key)}
            >
              {lane.title}
            </button>
          ))}
        </div>
        {freshnessHint ? (
          <p className={`report-timeline-freshness${nextRefreshOverdue ? " is-warn" : ""}`}>{freshnessHint}</p>
        ) : null}
        <EventTimeline items={entries} />
      </ReportSection>

      {materials.length ? (
        <ReportSection title="相关资料" count={materials.length} defaultOpen>
          <ul className="report-ref-list">
            {materials.map((item) => (
              <li key={item.id || item.url || item.title} className="report-ref-row">
                <div className="report-ref-title-block">
                  <span className="report-ref-title">{item.title || item.url || "来源"}</span>
                  {item.source || item.provider ? (
                    <span className="report-ref-meta">{item.source || item.provider}</span>
                  ) : null}
                </div>
                <SourceJumpLink url={item.url} />
              </li>
            ))}
          </ul>
        </ReportSection>
      ) : null}
    </div>
  );
}
