import { TimelineRefreshCutoffCard } from "../timeline/TimelineRefreshCutoff";
import { SourceJumpLink } from "./SourceJumpLink";

export type EventTimelineItem = {
  id: string;
  /** 展示用时间（优先 API `time`，否则由 `at` 格式化） */
  timestamp?: string;
  at?: string;
  /** 无有效发生时间，归入末尾「当前」节点 */
  undated?: boolean;
  /** 时间线顶部「截至上次更新」锚点 */
  isRefreshCutoff?: boolean;
  title: string;
  summary?: string;
  desc?: string;
  laneTitle?: string;
  url?: string;
};

export function hasTimelineTimestamp(item: Pick<EventTimelineItem, "at" | "undated" | "timestamp">) {
  if (item.undated) return false;
  if (item.at) {
    const d = new Date(item.at);
    if (!Number.isNaN(d.getTime())) return true;
  }
  const raw = item.timestamp?.trim();
  if (!raw) return false;
  const d = new Date(raw.replace(" ", "T"));
  return !Number.isNaN(d.getTime());
}

export function partitionTimelineItems(items: EventTimelineItem[]) {
  const timed: EventTimelineItem[] = [];
  const undated: EventTimelineItem[] = [];
  for (const item of items) {
    if (hasTimelineTimestamp(item)) timed.push(item);
    else undated.push(item);
  }
  return { timed, undated };
}

function parseItemDate(item: EventTimelineItem) {
  const raw = item.timestamp?.trim();
  if (raw) {
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (match) {
      return new Date(Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5])
      ));
    }
  }
  if (item.at) {
    const d = new Date(item.at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function utcDayKey(d: Date) {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function formatTimestamp(item: EventTimelineItem) {
  const d = parseItemDate(item);
  if (!d) return item.timestamp?.trim() || "—";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function formatLeftTimeLabels(item: EventTimelineItem, showDate: boolean) {
  const d = parseItemDate(item);
  if (!d) return { time: "—", date: "" };
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const date = showDate ? `${d.getUTCMonth() + 1}.${String(d.getUTCDate()).padStart(2, "0")}` : "";
  return { time: `${hh}:${mm}`, date };
}

function EventTimelineCard({ item }: { item: EventTimelineItem }) {
  return (
    <article className="event-timeline-card report-event-card">
      {item.laneTitle ? (
        <div className="event-timeline-card-head">
          <span className="report-timeline-lane">{item.laneTitle}</span>
        </div>
      ) : null}
      <div className="report-timeline-title-row">
        <div className="report-timeline-title-block">
          <h5 className="report-event-title">{item.title}</h5>
          {item.summary ? <p className="report-event-overview">{item.summary}</p> : null}
        </div>
        <SourceJumpLink url={item.url} />
      </div>
    </article>
  );
}

export function EventTimeline({ items }: { items: EventTimelineItem[] }) {
  if (!items.length) {
    return <p className="tech-radar-empty">—</p>;
  }

  const { timed, undated } = partitionTimelineItems(items);

  return (
    <ol className="event-timeline" aria-label="事件时间线">
      {timed.map((item, index) => {
        const isLastTimed = index === timed.length - 1;
        const hasCurrent = undated.length > 0;
        const prev = index > 0 ? timed[index - 1] : null;
        const prevDay = prev ? parseItemDate(prev) : null;
        const curDay = parseItemDate(item);
        const showDate =
          !prevDay || !curDay || utcDayKey(prevDay) !== utcDayKey(curDay);
        const left = formatLeftTimeLabels(item, showDate);
        const isCutoff = Boolean(item.isRefreshCutoff);
        const nextIsEvent = index < timed.length - 1 && !timed[index + 1]?.isRefreshCutoff;

        return (
          <li
            key={item.id}
            className={`event-timeline-item${isCutoff ? " event-timeline-item-refresh-cutoff" : ""}`}
          >
            <time className="event-timeline-left-time" dateTime={item.at}>
              {left.date ? <span className="event-timeline-left-date">{left.date}</span> : null}
              <span className="event-timeline-left-clock">{left.time}</span>
            </time>
            <div className="event-timeline-rail" aria-hidden>
              <span
                className={`event-timeline-dot${isCutoff ? " event-timeline-dot-refresh" : ""}`}
              />
              {!isLastTimed || hasCurrent ? (
                <span
                  className={`event-timeline-connector${
                    isCutoff && nextIsEvent ? " is-dashed" : ""
                  }${isLastTimed && hasCurrent ? " is-dashed" : ""}`}
                />
              ) : null}
            </div>
            {isCutoff ? (
              <TimelineRefreshCutoffCard item={{ ...item, summary: item.summary || item.desc }} />
            ) : (
              <EventTimelineCard item={item} />
            )}
          </li>
        );
      })}
      {undated.length ? (
        <li className="event-timeline-item event-timeline-item-current">
          <div className="event-timeline-left-time">
            <span className="event-timeline-left-clock event-timeline-now-label">当前</span>
          </div>
          <div className="event-timeline-rail" aria-hidden>
            <span className="event-timeline-dot event-timeline-dot-current" />
          </div>
          <div className="event-timeline-current-stack">
            {undated.map((item) => (
              <EventTimelineCard key={item.id} item={item} />
            ))}
          </div>
        </li>
      ) : null}
    </ol>
  );
}

export function sortTimelineItemsDesc<T extends { at?: string; undated?: boolean; isRefreshCutoff?: boolean }>(
  items: T[]
) {
  return items.slice().sort((a, b) => {
    if (a.isRefreshCutoff && !b.isRefreshCutoff) return -1;
    if (!a.isRefreshCutoff && b.isRefreshCutoff) return 1;
    const aTimed = hasTimelineTimestamp(a);
    const bTimed = hasTimelineTimestamp(b);
    if (!aTimed && !bTimed) return 0;
    if (!aTimed) return 1;
    if (!bTimed) return -1;
    return new Date(b.at!).getTime() - new Date(a.at!).getTime();
  });
}

export function sortTimelineItemsAsc<T extends { at?: string; undated?: boolean }>(items: T[]) {
  return items.slice().sort((a, b) => {
    const aTimed = hasTimelineTimestamp(a);
    const bTimed = hasTimelineTimestamp(b);
    if (!aTimed && !bTimed) return 0;
    if (!aTimed) return 1;
    if (!bTimed) return -1;
    return new Date(a.at!).getTime() - new Date(b.at!).getTime();
  });
}

export function timelineRangeFromItems(
  items: Array<{ at?: string; timestamp?: string; undated?: boolean }>
) {
  if (!items.length) return "";
  const { timed, undated } = partitionTimelineItems(items as EventTimelineItem[]);
  if (!timed.length) return undated.length ? "当前" : "";
  const sorted = sortTimelineItemsAsc(timed);
  const first = formatTimestamp(sorted[0]);
  const last = formatTimestamp(sorted[sorted.length - 1]);
  const span = first === last ? first : `${first} — ${last}`;
  return undated.length ? `${span} · 当前` : span;
}
