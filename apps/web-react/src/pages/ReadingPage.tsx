import { FormEvent, useEffect, useState } from "react";
import { ReadingBriefDocument } from "../components/ReadingBriefDocument";
import { WorkspaceHero } from "../components/report/WorkspaceHero";
import { fetchJson } from "../lib/api";
import { useAppStore } from "../stores/useAppStore";

type Paper = {
  summary?: string;
  keyPoints?: string[];
  recommendations?: string[];
};

type ReadingReport = {
  sourceType?: string;
  sourceName?: string;
  sourceUrl?: string | null;
  sources?: { webUrl?: string | null; pdfUrl?: string | null; videoUrl?: string | null; audioUrl?: string | null };
  paper?: Paper;
  summary?: string;
  keyPoints?: string[];
  recommendations?: string[];
  warnings?: string[];
};

type HistoryItem = {
  sessionId: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  summaryPreview?: string;
};

function formatWhen(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString("zh-CN")} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

export function ReadingPage() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<ReadingReport | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [briefExpanded, setBriefExpanded] = useState(true);
  const [reportRevision, setReportRevision] = useState(0);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const payload = await fetchJson<{ items?: HistoryItem[] }>("/api/v1/reading-assistant/history?limit=20");
      return payload.items || [];
    } catch {
      return [];
    } finally {
      setHistoryLoading(false);
    }
  };

  const restoreSession = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setBriefExpanded(true);
    const payload = await fetchJson<{ report: ReadingReport }>(
      `/api/v1/reading-assistant/sessions/${encodeURIComponent(sessionId)}`
    );
    showReport(payload.report, sessionId);
    setError("");
  };

  const consumePendingReadingSession = useAppStore((s) => s.consumePendingReadingSession);

  useEffect(() => {
    void (async () => {
      const items = await loadHistory();
      setHistory(items);
      const pending = consumePendingReadingSession();
      if (pending) {
        try {
          await restoreSession(pending);
          return;
        } catch {
          /* fall through */
        }
      }
      if (items[0]?.sessionId) {
        try {
          await restoreSession(items[0].sessionId);
        } catch {
          /* 历史损坏时忽略，保留侧栏列表 */
        }
      }
    })();
  }, [consumePendingReadingSession]);

  const showReport = (next: ReadingReport, sessionId: string | null) => {
    setReport(next);
    setActiveSessionId(sessionId);
    setBriefExpanded(true);
    setReportRevision((v) => v + 1);
  };

  const summarize = async () => {
    if (!input.trim()) return;
    setRunning(true);
    setError("");
    try {
      const payload = await fetchJson<{ report: ReadingReport; sessionId?: string }>(
        "/api/v1/reading-assistant/sessions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ smartInput: input.trim() })
        }
      );
      showReport(payload.report, payload.sessionId || null);
      const items = await loadHistory();
      setHistory(items);
    } catch (summarizeError) {
      setReport(null);
      setActiveSessionId(null);
      setError((summarizeError as Error).message || "生成失败");
    } finally {
      setRunning(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await summarize();
  };

  const openSession = async (sessionId: string) => {
    try {
      await restoreSession(sessionId);
      const items = await loadHistory();
      setHistory(items);
    } catch (openError) {
      setError((openError as Error).message || "历史读取失败");
    }
  };

  const paper: Paper = report?.paper || {
    summary: report?.summary,
    keyPoints: report?.keyPoints,
    recommendations: report?.recommendations
  };
  const warnings = (report?.warnings || []).filter(Boolean);
  const briefHeading = report?.sourceName || "技术简报";

  return (
    <section className="panel reading-layout">
      <WorkspaceHero
        eyebrow="Reading Assistant"
        title="阅读助手"
        description="粘贴网页、PDF、音视频链接或正文；音视频请附字幕/转写，系统输出中文摘要、要点与建议。"
        stats={[
          { label: "当前来源", value: report?.sourceType || "待输入", tone: "accent" },
          { label: "历史记录", value: history.length },
          { label: "输出结构", value: "摘要 · 要点 · 建议", tone: "muted" }
        ]}
      />
      <div className="reading-grid">
        <div className="reading-main">
          <div className="reading-input-block">
            <form className="stack" onSubmit={onSubmit}>
              <input
                className="input"
                type="text"
                placeholder="粘贴网页/PDF/音视频链接，或「链接 + 换行 + 正文/字幕/转写」，Enter 执行"
                value={input}
                onChange={(event) => setInput(event.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={running}>
                {running ? "执行中..." : "执行"}
              </button>
            </form>
            {error ? <p className="error-text">{error}</p> : null}
          </div>

          <div className="reading-report-view">
            {report ? (
              <article className={`reading-brief-shell daily-card${briefExpanded ? " is-expanded" : " is-collapsed"}`}>
                <header className="reading-brief-header daily-card-header">
                  <div className="daily-card-heading">
                    <button
                      type="button"
                      className="daily-card-title-btn"
                      onClick={() => setBriefExpanded((value) => !value)}
                      aria-expanded={briefExpanded}
                    >
                      <h3 className="reading-brief-title daily-card-title">{briefHeading}</h3>
                      <span className="daily-card-toggle">{briefExpanded ? "收起" : "展开"}</span>
                    </button>
                    <p className="daily-card-meta">摘要 · 要点 · 建议</p>
                  </div>
                </header>
                {briefExpanded ? (
                  <ReadingBriefDocument
                    key={reportRevision}
                    paper={paper}
                    warnings={warnings}
                    sourceName={report.sourceName}
                    sourceUrl={report.sourceUrl}
                    sources={report.sources}
                  />
                ) : (
                  <p className="report-lead reading-brief-teaser">{paper.summary || "暂无摘要"}</p>
                )}
              </article>
            ) : (
              <p className="result-text">输入后按 Enter 生成简报，或从右侧历史记录选择一条回填。</p>
            )}
          </div>
        </div>

        <aside className="reading-history home-history">
          <div className="panel-header">
            <h3 className="reading-block-title">历史记录</h3>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void loadHistory().then((items) => setHistory(items))}
            >
              刷新
            </button>
          </div>
          <p className="result-text home-history-hint">侧栏仅用于选择历史，简报统一在左侧展示。</p>
          {historyLoading ? <p className="result-text">加载历史…</p> : null}
          {!historyLoading && !history.length ? (
            <p className="result-text">暂无历史，完成一次阅读后会出现。</p>
          ) : null}
          <ul className="history-list report-history-list">
            {history.map((item) => (
              <li key={item.sessionId}>
                <button
                  type="button"
                  className={`history-item-btn${activeSessionId === item.sessionId ? " is-active" : ""}`}
                  onClick={() => void openSession(item.sessionId)}
                >
                  <span className="history-item-title">{item.title}</span>
                  <span className="history-item-meta">{formatWhen(item.updatedAt || item.createdAt)}</span>
                  {item.summaryPreview ? <span className="history-item-preview">{item.summaryPreview}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
