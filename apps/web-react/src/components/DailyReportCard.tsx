import type { ReactNode } from "react";
import { DailyReportDetail, type DailyReportDetailData } from "./DailyReportDetail";
import { DailyReportTimeline, type DailyReportTimelineData } from "./DailyReportTimeline";
import { reportStatusLabel, type ReportStatus } from "../lib/reportStatus";

type EventItem = {
  id: string;
  title: string;
  summary?: string;
};

export type DailyReportCardData = DailyReportDetailData &
  DailyReportTimelineData & {
    date?: string;
    title?: string;
    events?: EventItem[];
    review?: { count?: number };
    presentation?: "timeline" | "archived";
    status?: ReportStatus;
  };

export function DailyReportCard({
  heading,
  report,
  loading,
  error,
  overview,
  expanded,
  onToggleExpanded,
  actions
}: {
  heading: string;
  report: DailyReportCardData | null;
  loading: boolean;
  error: string;
  overview: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  actions?: ReactNode;
}) {
  const events = report?.events || [];
  const hasReportDetail = Boolean(report && !loading && !error);
  const isTimeline = report?.presentation === "timeline";
  const teaser = loading ? "加载中…" : overview || error || "暂无概述";

  return (
    <div className={`daily-card${expanded ? " is-expanded" : " is-collapsed"}`}>
      <div className="panel-header daily-card-header">
        <div className="daily-card-heading">
          <button
            type="button"
            className="daily-card-title-btn"
            onClick={onToggleExpanded}
            disabled={!hasReportDetail}
            aria-expanded={expanded && hasReportDetail}
          >
            <h3 className="daily-card-title">{heading}</h3>
            {hasReportDetail ? (
              <span className="daily-card-toggle">{expanded ? "收起" : "展开"}</span>
            ) : null}
          </button>
          <p className="daily-card-meta">
            {report?.date || "—"} · {events.length} 条事件
            {isTimeline ? " · 时间线模式" : ""}
            {report?.status ? ` · ${reportStatusLabel(report.status)}` : ""}
            {report?.review?.count ? ` · 已 review` : ""}
          </p>
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      {!expanded ? (
        <div className="daily-card-teaser">
          <p className="daily-card-summary">{teaser}</p>
        </div>
      ) : null}
      {!loading && error ? <p className="error-text">{error}</p> : null}
      {expanded && hasReportDetail && report ? (
        isTimeline ? <DailyReportTimeline report={report} /> : <DailyReportDetail report={report} />
      ) : null}
      {!expanded && hasReportDetail ? <p className="result-text daily-card-hint">点击标题查看完整报告。</p> : null}
    </div>
  );
}
