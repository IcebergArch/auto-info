export type TimelineRefreshCutoffItem = {
  id: string;
  at?: string;
  title?: string;
  summary?: string;
  desc?: string;
  isRefreshCutoff?: boolean;
};

function formatRefreshRangeEnd(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatLeftClock(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatLeftDate(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export function TimelineRefreshCutoffCard({ item }: { item: TimelineRefreshCutoffItem }) {
  const endLabel = formatRefreshRangeEnd(item.at);
  const body = item.summary || item.desc || "";
  return (
    <article className="event-timeline-card report-event-card event-timeline-refresh-cutoff">
      <div className="event-timeline-card-head">
        <span className="report-timeline-lane">○ 更新截止</span>
      </div>
      <div className="report-timeline-title-block">
        <h5 className="report-event-title">{item.title || "上次更新"}</h5>
        <p className="report-event-overview">
          <span className="report-timeline-refresh-range">00:00 — {endLabel}</span>
          {body ? ` · ${body}` : null}
        </p>
      </div>
    </article>
  );
}

/** 与首页 EventTimeline 一致的左侧轴 + 刷新截止 Card */
export function TimelineRefreshCutoffRow({
  item,
  showDate = true,
  connectorDashed = true,
  showConnector = true
}: {
  item: TimelineRefreshCutoffItem;
  showDate?: boolean;
  connectorDashed?: boolean;
  showConnector?: boolean;
}) {
  const dateLabel = showDate ? formatLeftDate(item.at) : "";
  return (
    <li className="event-timeline-item event-timeline-item-refresh-cutoff">
      <time className="event-timeline-left-time" dateTime={item.at}>
        {dateLabel ? <span className="event-timeline-left-date">{dateLabel}</span> : null}
        <span className="event-timeline-left-clock">{formatLeftClock(item.at)}</span>
      </time>
      <div className="event-timeline-rail" aria-hidden>
        <span className="event-timeline-dot event-timeline-dot-refresh" />
        {showConnector ? (
          <span className={`event-timeline-connector${connectorDashed ? " is-dashed" : ""}`} />
        ) : null}
      </div>
      <TimelineRefreshCutoffCard item={item} />
    </li>
  );
}
