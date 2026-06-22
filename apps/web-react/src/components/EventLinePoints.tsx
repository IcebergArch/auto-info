import { ReportSection } from "./report/ReportSection";
import type { LinePoint } from "./EventLinesChart";

type LineLane = {
  id: string;
  label: string;
  points: LinePoint[];
};

type NodeHint = {
  id: string;
  title?: string;
  summary?: string;
  category?: string;
  region?: string;
  severity?: number;
};

function parseViewTs(iso: string) {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function EventLinePoints({
  lanes,
  selectedPointIds = [],
  onSelect,
  nodeById = new Map<string, NodeHint>(),
  viewStart,
  viewEnd
}: {
  lanes: LineLane[];
  selectedPointIds?: string[];
  onSelect?: (pointId: string) => void;
  nodeById?: Map<string, NodeHint>;
  viewStart?: number;
  viewEnd?: number;
}) {
  const selectedSet = new Set(selectedPointIds);
  const multiSelected = selectedPointIds.length > 1;
  const allPoints = lanes
    .flatMap((lane) =>
      (lane.points || []).map((point) => ({
        ...point,
        laneLabel: lane.label
      }))
    )
    .filter((point) => {
      if (viewStart == null || viewEnd == null) return true;
      const t = parseViewTs(point.at);
      return Number.isFinite(t) && t >= viewStart && t <= viewEnd;
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  if (!allPoints.length) return null;

  return (
    <ReportSection title="事件节点明细" count={allPoints.length} defaultOpen={false}>
      <ul className="event-point-list">
        {allPoints.map((point) => {
          const hint = point.eventId ? nodeById.get(point.eventId) : undefined;
          const summary = hint?.summary || point.text || "";
          const isActive = selectedSet.has(point.id);
          return (
            <li
              key={point.id}
              className={`event-point-item${isActive ? " is-active" : ""}${multiSelected && isActive ? " is-cluster-active" : ""}`}
            >
              <button type="button" className="event-point-btn" onClick={() => onSelect?.(point.id)}>
                <div className="event-point-head">
                  <span className="event-point-time">{point.at?.slice(0, 10) || ""}</span>
                  <span className="event-point-lane">{point.laneLabel}</span>
                  {multiSelected && isActive ? (
                    <span className="event-point-cluster-tag">同批</span>
                  ) : null}
                </div>
                <p className="event-point-title">{hint?.title || point.title}</p>
                {isActive && summary ? <p className="event-point-text">{summary}</p> : null}
                {!isActive && summary ? (
                  <p className="event-point-teaser">{summary.slice(0, 72)}{summary.length > 72 ? "…" : ""}</p>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </ReportSection>
  );
}
