import { useState } from "react";
import { SourceJumpLink } from "../report/SourceJumpLink";
import { TechRadarSourceLinks } from "./TechRadarSourceLinks";
import type { TechRadarEntry } from "./types";
import {
  formatDateKeysRange,
  formatEntryPeriodLabel,
  formatRadarKindPill,
  formatRadarStatusMarker
} from "./techRadarFormat";

export function TechRadarTimelineEntry({
  entry,
  selected,
  onSelect,
  onOpenBriefing,
  expandable = false,
  hidePeriodLabel = false
}: {
  entry: TechRadarEntry;
  selected: boolean;
  onSelect: (entry: TechRadarEntry) => void;
  onOpenBriefing?: (sessionId: string) => void;
  expandable?: boolean;
  hidePeriodLabel?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const blocks = entry.detailBlocks || [];
  const sources = (entry.sources || []).filter((s) => s.url);
  const primaryUrl = sources[0]?.url;
  const isMonth = entry.granularity === "month";
  const isWeek = entry.granularity === "week";
  const showInlineSourceList = !isMonth && !isWeek;
  const showExpandBlocks = expandable && (isMonth || isWeek) && blocks.length > 0;
  const showExpand = showExpandBlocks || (expandable && blocks.length > 0 && !isMonth && !isWeek);
  const extraSources = showInlineSourceList && sources.length > 1 ? sources.slice(1) : [];
  const relatedRange =
    isMonth || isWeek ? "" : formatDateKeysRange(entry.relatedReportDates || []);

  return (
    <article
      className={`report-timeline-item report-timeline-item-selectable${selected ? " is-selected" : ""}`}
    >
      <button type="button" className="report-timeline-time-btn" onClick={() => onSelect(entry)}>
        <div className={`report-timeline-time${hidePeriodLabel ? " is-period-hidden" : ""}`}>
          {hidePeriodLabel ? null : <span>{formatEntryPeriodLabel(entry)}</span>}
          <span className="report-timeline-lane">
            {formatRadarStatusMarker(entry)} {formatRadarKindPill(entry)}
          </span>
        </div>
      </button>
      <div className="report-timeline-body">
        <div className="report-timeline-title-row">
          <button type="button" className="report-timeline-select-btn" onClick={() => onSelect(entry)}>
            <div className="report-timeline-title-block">
              <h5 className="report-timeline-title">{entry.title}</h5>
              {entry.brief && !isMonth && !isWeek ? (
                <p className="report-timeline-overview">{entry.brief}</p>
              ) : null}
            </div>
          </button>
          {primaryUrl ? <SourceJumpLink url={primaryUrl} /> : null}
        </div>
        {extraSources.length ? <TechRadarSourceLinks sources={extraSources} compact /> : null}
        {!expandable && showInlineSourceList && sources.length && !primaryUrl ? (
          <TechRadarSourceLinks sources={sources} compact />
        ) : null}
        {relatedRange ? (
          <p className="tech-radar-report-dates" title="关联日报">
            {relatedRange}
          </p>
        ) : null}
        {entry.briefingSessionId || showExpand ? (
          <div className="report-timeline-actions">
            {entry.briefingSessionId && onOpenBriefing ? (
              <button
                type="button"
                className="report-timeline-action-link"
                onClick={() => onOpenBriefing(entry.briefingSessionId!)}
              >
                简报
              </button>
            ) : null}
            {showExpand ? (
              <button
                type="button"
                className="report-timeline-action-link"
                onClick={() => setExpanded((value) => !value)}
                aria-expanded={expanded}
              >
                {expanded ? "收起" : "展开"}
              </button>
            ) : null}
          </div>
        ) : null}
        {expanded && showExpand ? (
          <div className="tech-radar-timeline-detail-blocks">
            {isMonth || isWeek ? (
              <p className="report-timeline-overview">{entry.brief}</p>
            ) : null}
            {blocks.map((block, index) => (
              <div key={`${block.label}-${index}`} className="tech-radar-timeline-detail-block">
                <div className="tech-radar-detail-block-head">
                  <h6 className="tech-radar-timeline-detail-label">{block.label}</h6>
                  {block.sourceUrl ? <SourceJumpLink url={block.sourceUrl} /> : null}
                </div>
                <p className="tech-radar-timeline-detail-body">{block.body}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
