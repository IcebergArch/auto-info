import { DailyReportOverviewPanels } from "./DailyReportOverviewPanels";
import { ReportSection } from "./report/ReportSection";
import { SourceJumpLink } from "./report/SourceJumpLink";

type EventReference = {
  url?: string;
  title?: string;
  source?: string;
  provider?: string;
};

type ReportEvent = {
  id: string;
  title: string;
  displayTitle?: string;
  desc?: string;
  summary?: string;
  category?: string;
  region?: string;
  time?: string;
  occurredAt?: string;
  severity?: number;
  tags?: string[];
  references?: EventReference[];
};

type ReportBlock = {
  title?: string;
  description?: string;
  summary?: string;
  events?: ReportEvent[];
};

type ReportReference = {
  id?: string;
  title?: string;
  url?: string;
  source?: string;
  provider?: string;
  eventId?: string;
};

export type DailyReportDetailData = {
  overview?: {
    summary?: string;
    bullets?: string[];
    panels?: import("./DailyReportOverviewPanels").OverviewPanelsMap;
  };
  focusSections?: {
    international?: ReportBlock;
    technology?: ReportBlock;
    finance?: ReportBlock;
    domestic?: ReportBlock;
    other?: ReportBlock;
  };
  references?: ReportReference[];
};

const REPORT_BLOCKS: Array<{
  key: "international" | "technology" | "finance" | "domestic" | "other";
  title: string;
  hint?: string;
}> = [
  { key: "international", title: "国际局势" },
  { key: "technology", title: "科技" },
  { key: "finance", title: "金融" },
  {
    key: "domestic",
    title: "国内",
    hint: "医疗、旅行、民生、媒体热点与中国本土关注"
  },
  { key: "other", title: "其他" }
];

function formatEventTime(event: ReportEvent) {
  const value = event.time || event.occurredAt || "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

function eventSourceUrl(event: ReportEvent, refByEventId: Map<string, ReportReference>) {
  const fromEvent = (event.references || []).find((ref) => ref.url)?.url;
  if (fromEvent) return fromEvent;
  const fromRef = refByEventId.get(event.id)?.url;
  if (fromRef) return fromRef;
  if (/^https?:\/\//i.test(String(event.title || "").trim())) return event.title.trim();
  return undefined;
}

function eventDescText(event: ReportEvent) {
  const raw = String(event.desc || event.summary || "").trim();
  if (!raw || /建议点击 ↗ 查看英文原文/.test(raw) || /出现值得跟踪的重要信息/.test(raw)) {
    return "";
  }
  return raw;
}

function EventCard({ event, refByEventId }: { event: ReportEvent; refByEventId: Map<string, ReportReference> }) {
  const sourceUrl = eventSourceUrl(event, refByEventId);
  const showSeverity = event.severity != null && event.severity >= 85;
  const headline = event.displayTitle?.trim() || event.title;
  const desc = eventDescText(event);
  const titleIsRawUrl = /^https?:\/\//i.test(String(event.title || "").trim());
  const showEnglishTitle = Boolean(
    !titleIsRawUrl && event.displayTitle?.trim() && event.displayTitle.trim() !== event.title
  );
  return (
    <article className="report-event-card">
      <div className="report-event-title-row">
        <div className="report-event-title-block">
          <h5 className="report-event-title">{headline}</h5>
          {showEnglishTitle ? <p className="report-event-title-en">{event.title}</p> : null}
          {desc ? <p className="report-event-overview">{desc}</p> : null}
        </div>
        <SourceJumpLink url={sourceUrl} />
      </div>
      <div className="report-event-foot">
        {formatEventTime(event) ? <span className="report-event-pill muted">{formatEventTime(event)}</span> : null}
        {event.category ? <span className="report-event-pill">{event.category}</span> : null}
        {event.region ? <span className="report-event-pill muted">{event.region}</span> : null}
        {showSeverity ? <span className="report-event-pill warn">冲击 {event.severity}</span> : null}
      </div>
    </article>
  );
}

function EventStack({
  events,
  refByEventId
}: {
  events: ReportEvent[];
  refByEventId: Map<string, ReportReference>;
}) {
  if (!events.length) {
    return <p className="result-text">本节暂无事件。</p>;
  }
  return (
    <div className="report-event-stack">
      {events.map((event) => (
        <EventCard key={event.id} event={event} refByEventId={refByEventId} />
      ))}
    </div>
  );
}

export function DailyReportDetail({ report }: { report: DailyReportDetailData }) {
  const blocks = report.focusSections || {};
  const bullets = (report.overview?.bullets || []).filter(Boolean);
  const references = report.references || [];
  const refByEventId = new Map(
    references.filter((ref) => ref.eventId).map((ref) => [ref.eventId as string, ref])
  );

  return (
    <div className="report-document daily-report-detail">
      <ReportSection title="概要" defaultOpen>
        <DailyReportOverviewPanels
          summary={report.overview?.summary}
          panels={report.overview?.panels}
          bullets={bullets}
        />
      </ReportSection>

      {REPORT_BLOCKS.map((block, index) => {
        const section = blocks[block.key];
        const events = section?.events || [];
        const hint = section?.description || block.hint;
        return (
          <ReportSection
            key={block.key}
            title={block.title}
            count={events.length}
            defaultOpen={index < 2}
          >
            {hint ? <p className="report-block-hint">{hint}</p> : null}
            <EventStack events={events} refByEventId={refByEventId} />
          </ReportSection>
        );
      })}

      {references.length ? (
        <ReportSection title="参考" count={references.length}>
          <ul className="report-ref-list">
            {references.map((ref) => (
              <li key={ref.id || ref.title || ref.url} className="report-ref-row">
                <div className="report-ref-title-block">
                  <span className="report-ref-title">{ref.title || ref.url || "本地来源"}</span>
                  {ref.source || ref.provider ? (
                    <span className="report-ref-meta">{ref.source || ref.provider}</span>
                  ) : null}
                </div>
                <SourceJumpLink url={ref.url} label="打开参考" />
              </li>
            ))}
          </ul>
        </ReportSection>
      ) : null}
    </div>
  );
}
