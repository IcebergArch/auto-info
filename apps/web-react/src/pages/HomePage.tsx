import { FormEvent, useCallback, useEffect, useState } from "react";
import { DailyReportCard, type DailyReportCardData } from "../components/DailyReportCard";
import { ThreeQuestionLens } from "../components/ThreeQuestionLens";
import { WorkspaceHero } from "../components/report/WorkspaceHero";
import { useRefreshIntervalMs } from "../hooks/useRefreshInterval";
import { fetchJson } from "../lib/api";
import { currentProductMonthKey, todayProductKey } from "../lib/productDate";
import { normalizeOverviewSummary } from "../lib/reportOverview";
import { reportStatusLabel, reportStatusTone } from "../lib/reportStatus";
import { useLatestAsync } from "../lib/useLatestAsync";

type ReportArchiveItem = {
  date: string;
  title?: string;
  storedAt?: string;
  eventCount?: number;
  reviewStatus?: string;
};

type IntakePayload = {
  event?: { title?: string; summary?: string };
  historyItem?: { resultTitle?: string; resultSummary?: string };
};

function todayKey() {
  return todayProductKey();
}

function historyReportLabel(item: ReportArchiveItem, today: string) {
  if (item.date !== today) {
    const raw = String(item.title || "").trim();
    if (raw === "今日日报" || raw === "今日") return "日报";
  }
  const raw = String(item.title || "").trim();
  const stripped = raw
    .replace(/^\d{4}-\d{2}-\d{2}\s*[-·]?\s*/, "")
    .replace(/^auto-info\s*/i, "")
    .replace(/日报$/i, "")
    .trim();
  return stripped || "日报";
}

function currentMonthKey() {
  return currentProductMonthKey();
}

function formatClock(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

type BackfillMode = "month" | "days";

type BackfillResult = {
  from?: string;
  to?: string;
  month?: string;
  days?: number;
  chunked?: boolean;
  chunks?: number;
  totalDays?: number;
  totalUpdated?: number;
  reports?: Array<{ date: string; eventCount?: number }>;
};

const BACKFILL_DAY_OPTIONS = [3, 7, 14, 30] as const;

export function HomePage() {
  const [viewDate, setViewDate] = useState(todayKey());
  const [report, setReport] = useState<DailyReportCardData | null>(null);
  const [archive, setArchive] = useState<ReportArchiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [archiveLoading, setArchiveLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchTitle, setSearchTitle] = useState("");
  const [searchSummary, setSearchSummary] = useState("");
  const [error, setError] = useState("");
  const [backfillMode, setBackfillMode] = useState<BackfillMode>("days");
  const [backfillMonth, setBackfillMonth] = useState(currentMonthKey());
  const [backfillDays, setBackfillDays] = useState(7);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState("");
  const [archiveError, setArchiveError] = useState("");
  const [backfillOpen, setBackfillOpen] = useState(false);

  const { refreshMs, refreshHours } = useRefreshIntervalMs();
  const { nextSeq: archiveNextSeq, isLatest: archiveIsLatest } = useLatestAsync();
  const { nextSeq: reportNextSeq, isLatest: reportIsLatest } = useLatestAsync();

  const isToday = viewDate === todayKey();
  const heading = isToday ? "今日日报" : `日报 · ${viewDate}`;

  const loadArchive = useCallback(async () => {
    const seq = archiveNextSeq();
    setArchiveLoading(true);
    setArchiveError("");
    try {
      const payload = await fetchJson<{ items?: ReportArchiveItem[] }>("/api/v1/daily-events/reports?limit=40");
      if (!archiveIsLatest(seq)) return;
      setArchive(Array.isArray(payload.items) ? payload.items : []);
    } catch (loadError) {
      if (!archiveIsLatest(seq)) return;
      setArchiveError((loadError as Error).message || "历史列表加载失败");
    } finally {
      if (archiveIsLatest(seq)) setArchiveLoading(false);
    }
  }, [archiveIsLatest, archiveNextSeq]);

  const loadReport = useCallback(
    async (date: string) => {
      const seq = reportNextSeq();
      setLoading(true);
      setError("");
      try {
        const params =
          date === todayKey()
            ? `?_=${Date.now()}`
            : `?date=${encodeURIComponent(date)}&_=${Date.now()}`;
        const payload = await fetchJson<DailyReportCardData>(`/api/v1/daily-events/report${params}`);
        if (!reportIsLatest(seq)) return;
        setReport(payload);
        setViewDate(payload.date || date);
      } catch (loadError) {
        if (!reportIsLatest(seq)) return;
        setReport(null);
        setError((loadError as Error).message || "日报读取失败");
      } finally {
        if (reportIsLatest(seq)) setLoading(false);
      }
    },
    [reportIsLatest, reportNextSeq]
  );

  useEffect(() => {
    void loadArchive();
    void loadReport(todayKey());
  }, [loadArchive, loadReport]);

  useEffect(() => {
    if (!isToday || viewDate !== todayKey()) return;
    const timer = window.setInterval(() => {
      void loadReport(todayKey());
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [isToday, viewDate, loadReport, refreshMs]);

  const selectDate = async (date: string) => {
    setViewDate(date);
    setExpanded(true);
    await loadReport(date);
  };

  const refreshToday = async () => {
    setRefreshing(true);
    try {
      await fetchJson("/api/v1/daily-events/report/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: todayKey() })
      });
      await loadReport(todayKey());
      await loadArchive();
      setError("");
    } catch (refreshError) {
      setError((refreshError as Error).message || "日报刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const runBackfillSinceDec = async () => {
    setBackfilling(true);
    setBackfillStatus("正在补齐 2025-12 至今（按月分批）…");
    try {
      const payload = await fetchJson<BackfillResult>("/api/v1/daily-events/report/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "2025-12-01", to: todayKey(), pullSources: false })
      });
      const radar = await fetchJson<{ created?: number; months?: string[] }>("/api/v1/tech-radar/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromMonth: "2025-12", toMonth: todayKey().slice(0, 7) })
      });
      setBackfillStatus(
        `日报 ${payload.from} → ${payload.to}，${payload.totalDays || 0} 天；科技雷达月归档 +${radar.created || 0} 条`
      );
      await loadArchive();
      await loadReport(viewDate);
      setError("");
    } catch (backfillError) {
      setBackfillStatus((backfillError as Error).message || "长区间回溯失败");
    } finally {
      setBackfilling(false);
    }
  };

  const runBackfill = async () => {
    if (backfillMode === "month" && !backfillMonth) return;
    if (backfillMode === "days" && (backfillDays < 1 || backfillDays > 31)) return;
    setBackfilling(true);
    setBackfillStatus("");
    try {
      const body =
        backfillMode === "month"
          ? { month: backfillMonth, pullSources: true }
          : { days: backfillDays, to: todayKey(), pullSources: true };
      const payload = await fetchJson<BackfillResult>("/api/v1/daily-events/report/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const rangeLabel =
        backfillMode === "month"
          ? `月份 ${payload.month || backfillMonth}`
          : `最近 ${payload.days ?? backfillDays} 天`;
      const chunkNote = payload.chunked ? `（分 ${payload.chunks || 0} 个月批次）` : "";
      setBackfillStatus(
        `已回溯${chunkNote}（${rangeLabel}）：${payload.from} → ${payload.to}，共 ${payload.totalDays || 0} 天，更新 ${payload.totalUpdated || 0} 条事件`
      );
      await loadArchive();
      await loadReport(viewDate);
      setError("");
    } catch (backfillError) {
      setBackfillStatus((backfillError as Error).message || "回溯失败");
    } finally {
      setBackfilling(false);
    }
  };

  const onSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const payload = await fetchJson<IntakePayload>("/api/v1/daily-events/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), category: "自动", searchLatest: true })
      });
      setSearchTitle(payload.historyItem?.resultTitle || payload.event?.title || query.trim());
      setSearchSummary(payload.historyItem?.resultSummary || payload.event?.summary || "已入库");
      await loadReport(viewDate);
      await loadArchive();
      setError("");
    } catch (searchError) {
      setSearchTitle(query.trim());
      setSearchSummary((searchError as Error).message || "检索失败");
    } finally {
      setSearching(false);
    }
  };

  const today = todayKey();
  const timelineEventCount =
    report?.timeline?.filter((item) => !item.isRefreshCutoff).length ??
    report?.events?.length ??
    0;
  const overview = report
    ? normalizeOverviewSummary(
        report.overview?.summary || "",
        report.date || viewDate,
        timelineEventCount
      )
    : "";
  const reportEventCount = report?.events?.length ?? timelineEventCount ?? "—";
  const activeRefreshHours = report?.refreshIntervalHours ?? refreshHours;
  const lastRefreshLabel = formatClock(report?.lastRefreshedAt) || (loading ? "读取中" : "—");
  const nextRefreshLabel = report?.nextRefreshAt
    ? `${formatClock(report.nextRefreshAt)} · ${activeRefreshHours}h`
    : `${activeRefreshHours}h`;
  const sourceStatusLabel = reportStatusLabel(report?.status);
  const historyArchive = archive
    .filter((item) => item.date && item.date <= today && item.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date));
  const todayArchive = archive.find((item) => item.date === today);
  const reportPrimaryAction = isToday ? (
    <button type="button" className="btn btn-primary" disabled={refreshing || loading} onClick={() => void refreshToday()}>
      {refreshing ? "刷新中…" : "刷新当日"}
    </button>
  ) : (
    <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => void selectDate(todayKey())}>
      回到今日
    </button>
  );

  return (
    <section className="panel home-layout">
      <WorkspaceHero
        eyebrow="Daily Intelligence"
        title="首页"
        description="搜索新事件，沉淀为当日线索；日报按时间线呈现，历史归档从右侧切换。"
        stats={[
          { label: "当前日期", value: viewDate, tone: "accent" },
          { label: "日报事件", value: reportEventCount },
          { label: "来源状态", value: sourceStatusLabel, tone: reportStatusTone(report?.status) },
          { label: "上次刷新", value: lastRefreshLabel },
          { label: "下次刷新", value: nextRefreshLabel, tone: "muted" }
        ]}
        actions={reportPrimaryAction}
      />
      <div className="home-grid">
        <div className="home-main">
          <div className="home-search-block">
            <form className="home-search-form" onSubmit={onSearch}>
              <div className="home-search-shell">
                <input
                  className="home-search-input"
                  type="text"
                  placeholder="输入问题，例如：今天全球金融市场有哪些关键变化？"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button type="submit" className="btn btn-primary home-search-submit" disabled={searching}>
                  {searching ? "检索中..." : "检索"}
                </button>
              </div>
            </form>
            {searchTitle ? (
              <div className="home-search-result" role="status">
                <span className="home-search-result-title">{searchTitle}</span>
                <span className="home-search-result-summary">{searchSummary}</span>
              </div>
            ) : null}
          </div>

          <ThreeQuestionLens report={report} viewDate={viewDate} loading={loading} />

          <div className="home-report-view">
            <DailyReportCard
              heading={heading}
              report={report}
              loading={loading}
              error={error}
              overview={overview}
              expanded={expanded}
              onToggleExpanded={() => setExpanded((value) => !value)}
            />
          </div>
        </div>

        <aside className="home-history home-filter-panel">
          <div className="panel-header">
            <h3 className="reading-block-title">筛选日期</h3>
            <button type="button" className="btn btn-secondary" onClick={() => void loadArchive()}>
              刷新
            </button>
          </div>
          <p className="result-text home-history-hint">侧栏仅用于选择日期，报告统一在左侧展示。</p>

          <div className="history-tools-block">
            <button type="button" className="btn btn-secondary history-tool-btn" onClick={() => setBackfillOpen(true)}>
              补齐历史
            </button>
            {backfillStatus ? <p className="result-text history-tool-status">{backfillStatus}</p> : null}
          </div>

          {archiveLoading ? <p className="result-text">加载历史…</p> : null}
          {archiveError ? <p className="result-text error-text">{archiveError}</p> : null}
          {!archiveLoading && !archiveError && historyArchive.length === 0 ? (
            <p className="result-text">暂无历史归档（今日日报见下方）。</p>
          ) : null}
          <ul className="history-list report-history-list">
            <li className="history-list-today">
              <button
                type="button"
                className={`history-item-btn history-item-today${viewDate === today ? " is-active" : ""}`}
                onClick={() => void selectDate(today)}
              >
                <span className="history-item-title">今日日报</span>
                <span className="history-item-meta">
                  {today}
                  {viewDate === today && report?.events?.length != null
                    ? ` · ${report.events.length} 条`
                    : todayArchive?.eventCount != null
                      ? ` · ${todayArchive.eventCount} 条`
                      : ""}
                </span>
              </button>
            </li>
            {historyArchive.map((item) => (
              <li key={item.date}>
                <button
                  type="button"
                  className={`history-item-btn${viewDate === item.date ? " is-active" : ""}`}
                  onClick={() => void selectDate(item.date)}
                >
                  <span className="history-item-title">
                    {item.date} · {historyReportLabel(item, today)}
                  </span>
                  <span className="history-item-meta">
                    {item.eventCount != null ? `${item.eventCount} 条事件` : "历史归档"}
                    {item.reviewStatus ? ` · ${item.reviewStatus}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      {backfillOpen ? (
        <div className="config-modal-backdrop home-backfill-modal-backdrop" role="presentation">
          <section
            className="config-modal home-backfill-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-backfill-title"
          >
            <div className="modal-header">
              <div>
                <h3 id="home-backfill-title" className="reading-block-title">
                  历史日报补齐
                </h3>
                <p className="result-text home-history-hint">
                  低频批处理，仅在需要补历史归档时使用；完成后自动刷新日期列表。
                </p>
              </div>
              <button
                type="button"
                className="btn btn-secondary modal-close-btn"
                onClick={() => setBackfillOpen(false)}
                aria-label="关闭历史日报补齐"
              >
                关闭
              </button>
            </div>
            <div className="backfill-block backfill-block-modal">
              <div className="backfill-mode" role="tablist" aria-label="补齐方式">
                <button
                  type="button"
                  role="tab"
                  aria-selected={backfillMode === "days"}
                  className={`backfill-mode-btn${backfillMode === "days" ? " is-active" : ""}`}
                  onClick={() => setBackfillMode("days")}
                >
                  按天数
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={backfillMode === "month"}
                  className={`backfill-mode-btn${backfillMode === "month" ? " is-active" : ""}`}
                  onClick={() => setBackfillMode("month")}
                >
                  按月
                </button>
              </div>
              {backfillMode === "days" ? (
                <div className="backfill-days">
                  <div className="backfill-day-chips">
                    {BACKFILL_DAY_OPTIONS.map((days) => (
                      <button
                        key={days}
                        type="button"
                        className={`backfill-day-chip${backfillDays === days ? " is-active" : ""}`}
                        onClick={() => setBackfillDays(days)}
                      >
                        {days} 天
                      </button>
                    ))}
                  </div>
                  <div className="backfill-row">
                    <label className="backfill-days-label">
                      <span>天数</span>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={31}
                        value={backfillDays}
                        onChange={(event) => setBackfillDays(Math.max(1, Math.min(31, Number(event.target.value) || 1)))}
                      />
                    </label>
                    <button type="button" className="btn btn-primary" disabled={backfilling} onClick={() => void runBackfill()}>
                      {backfilling ? "补齐中…" : "补齐"}
                    </button>
                  </div>
                  <p className="backfill-hint">含今日，最多 31 天</p>
                </div>
              ) : (
                <div className="backfill-row">
                  <input
                    className="input input-month"
                    type="month"
                    value={backfillMonth}
                    onChange={(event) => setBackfillMonth(event.target.value)}
                  />
                  <button type="button" className="btn btn-primary" disabled={backfilling} onClick={() => void runBackfill()}>
                    {backfilling ? "补齐中…" : "补齐"}
                  </button>
                </div>
              )}
              <div className="backfill-row backfill-preset-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={backfilling}
                  onClick={() => void runBackfillSinceDec()}
                >
                  {backfilling ? "补齐中…" : "2025-12 至今"}
                </button>
              </div>
              <p className="backfill-hint">长区间按月分批；今日日报每 {refreshHours} 小时自动刷新（配置页可调）</p>
              {backfillStatus ? <p className="result-text">{backfillStatus}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
