import type { LinePoint } from "./EventLinesChart";

type NodeHint = {
  id: string;
  title?: string;
  summary?: string;
  occurredAt?: string;
  severity?: number;
  category?: string;
  region?: string;
};

type ClusterItem = {
  point: LinePoint;
  laneLabel: string;
  nodeHint?: NodeHint;
};

function EventLineDetailCard({
  point,
  laneLabel,
  nodeHint
}: {
  point: LinePoint;
  laneLabel: string;
  nodeHint?: NodeHint;
}) {
  const summary = nodeHint?.summary || point.text || "";
  return (
    <article className="event-line-detail event-line-detail-in-cluster">
      <div className="event-line-detail-head">
        <span className="event-line-detail-time">{point.at?.slice(0, 10) || ""}</span>
        <span className="event-line-detail-lane">{laneLabel}</span>
        {point.level ? <span className="event-line-detail-level">{point.level}</span> : null}
      </div>
      <h4 className="event-line-detail-title">{nodeHint?.title || point.title}</h4>
      {summary ? <p className="event-line-detail-text">{summary}</p> : null}
      {nodeHint?.category || nodeHint?.region ? (
        <p className="event-line-detail-meta">
          {[nodeHint.category, nodeHint.region].filter(Boolean).join(" · ")}
          {nodeHint.severity != null && nodeHint.severity >= 85 ? ` · 冲击 ${nodeHint.severity}` : ""}
        </p>
      ) : null}
    </article>
  );
}

export function EventLineClusterDetails({
  items,
  focusPointId
}: {
  items: ClusterItem[];
  focusPointId?: string | null;
}) {
  if (!items.length) return null;

  const sorted = items.slice().sort((a, b) => String(b.point.at).localeCompare(String(a.point.at)));
  const dateLabel = sorted[0]?.point.at?.slice(0, 10) || "";

  return (
    <section className="event-line-cluster-panel">
      <header className="event-line-cluster-head">
        <h4 className="event-line-cluster-title">
          {items.length > 1 ? `该时段 ${items.length} 个事件` : "事件明细"}
        </h4>
        {dateLabel ? <span className="event-line-cluster-date">{dateLabel}</span> : null}
      </header>
      <div className="event-line-cluster-stack">
        {sorted.map((item) => (
          <EventLineDetailCard
            key={item.point.id}
            point={item.point}
            laneLabel={item.laneLabel}
            nodeHint={item.nodeHint}
          />
        ))}
      </div>
      {focusPointId && items.length > 1 ? (
        <p className="result-text event-line-cluster-hint">下方列表中与高亮圆点对应项已同步选中。</p>
      ) : null}
    </section>
  );
}
