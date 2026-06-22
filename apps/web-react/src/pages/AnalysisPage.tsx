import { FormEvent, useEffect, useState } from "react";
import { AnalysisRelationsList } from "../components/AnalysisRelationsList";
import type { EventLinesPayload } from "../components/EventLinesChart";
import { InfluenceRelationList } from "../components/InfluenceRelationList";
import { ReportSection } from "../components/report/ReportSection";
import { WorkspaceHero } from "../components/report/WorkspaceHero";
import { fetchJson } from "../lib/api";

type AnalysisNode = {
  id: string;
  title?: string;
  occurredAt?: string;
  severity?: number;
  summary?: string;
};

type AnalysisEdge = {
  id?: string;
  from: string;
  to: string;
  label?: string;
  tone?: string;
  weight?: number;
  influence?: string;
};

type IntelMeta = {
  queries?: string[];
  articlesIngested?: number;
  seedsUpserted?: number;
  matched?: number;
};

type ObjectBriefing = {
  available: boolean;
  type?: string;
  persona?: string;
  isFinance?: boolean;
  reason?: string;
  whatItIs?: string;
  logic?: string[];
  misconceptions?: string[];
  recent?: string[];
  risks?: string[];
  foresight?: string[];
  entryExit?: string[];
  conclusion?: string;
};

type AnalysisPayload = {
  sessionId?: string;
  query?: string;
  briefing?: ObjectBriefing;
  nodes?: AnalysisNode[];
  edges?: AnalysisEdge[];
  eventLines?: EventLinesPayload;
  intel?: IntelMeta;
  recallSource?: string;
  graphSource?: "neo4j" | "memory";
  neo4j?: {
    synced?: boolean;
    reason?: string;
    message?: string;
    nodes?: number;
    edges?: number;
    verified?: boolean;
    recalledNodes?: number;
  };
};

type HistoryItem = {
  sessionId: string;
  query: string;
  preview?: string;
  yearSpan?: string;
  mainPointCount?: number;
  createdAt?: string;
  updatedAt?: string;
  secondaryQuery?: string;
};

type AnalysisSession = {
  sessionId: string;
  query?: string;
  result?: AnalysisPayload;
};

function formatWhen(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.toLocaleDateString("zh-CN")} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

export function AnalysisPage() {
  const [query, setQuery] = useState("俄乌冲突");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<AnalysisPayload>({});
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const applyPayload = (result: AnalysisPayload, sessionId?: string | null) => {
    setPayload(result);
    setActiveSessionId(sessionId || result.sessionId || null);
    if (result.query) setQuery(result.query);
  };

  const clearResult = () => {
    setPayload({});
    setActiveSessionId(null);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const list = await fetchJson<{ items?: HistoryItem[] }>("/api/v1/analysis/history?limit=20");
      return list.items || [];
    } catch {
      return [];
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const items = await loadHistory();
      setHistory(items);
      if (items[0]?.sessionId) {
        try {
          const session = await fetchJson<AnalysisSession>(
            `/api/v1/analysis/sessions/${encodeURIComponent(items[0].sessionId)}`
          );
          const result = session.result || {};
          applyPayload(
            { ...result, sessionId: session.sessionId, query: session.query || result.query },
            session.sessionId
          );
        } catch {
          /* 忽略损坏的历史项 */
        }
      }
    })();
  }, []);

  const runAnalysis = async () => {
    if (!query.trim()) return;
    setRunning(true);
    setError("");
    try {
      const params = new URLSearchParams({
        query: query.trim(),
        coreOnly: "0"
      });
      const result = await fetchJson<AnalysisPayload>(`/api/v1/analysis/analyze?${params.toString()}`);
      applyPayload(result, result.sessionId || null);
      const items = await loadHistory();
      setHistory(items);
    } catch (runError) {
      clearResult();
      setError((runError as Error).message || "分析失败");
    } finally {
      setRunning(false);
    }
  };

  const run = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runAnalysis();
  };

  const openSession = async (sessionId: string) => {
    if (activeSessionId === sessionId && (payload.nodes?.length || payload.eventLines)) {
      clearResult();
      return;
    }
    try {
      const session = await fetchJson<AnalysisSession>(`/api/v1/analysis/sessions/${encodeURIComponent(sessionId)}`);
      const result = session.result || {};
      applyPayload({ ...result, sessionId: session.sessionId, query: session.query || result.query }, session.sessionId);
      setError("");
    } catch (openError) {
      setError((openError as Error).message || "历史读取失败");
    }
  };

  const intel = payload.intel;
  const eventLines = payload.eventLines;
  const influences = eventLines?.influences || [];
  const hasResult = Boolean(eventLines || (payload.nodes || []).length);

  return (
    <section className="panel analysis-layout">
      <WorkspaceHero
        eyebrow="白泽 · 分析"
        title="白泽 · 分析"
        description="知万物之情状。给一个对象——公司、股票、政策、市场或一篇资料——系统检索关联，梳理出事件、要点与影响关系，帮你看懂全貌与逻辑。"
        stats={[
          { label: "当前对象", value: query || "—", tone: "accent" },
          { label: "事件数", value: payload.nodes?.length || 0 },
          { label: "关联数", value: payload.edges?.length || 0, tone: "muted" }
        ]}
      />
      <div className="analysis-grid">
        <div className="analysis-main">
          <form className="stack analysis-input-block" onSubmit={run}>
            <input
              className="input"
              type="text"
              placeholder="输入分析对象：公司 / 股票 / 政策 / 市场，或粘贴一篇资料链接"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button type="submit" className="btn btn-primary" disabled={running}>
              {running ? "拉取 intel 并分析…" : "执行"}
            </button>
            {error ? <p className="error-text">{error}</p> : null}
          </form>

          {intel ? (
            <p className="result-text">
              Intel 入库：检索 {intel.queries?.length || 0} 轮 · 文章 {intel.articlesIngested || 0} 篇 · 脉络种子{" "}
              {intel.seedsUpserted || 0} 条 · 匹配事件 {intel.matched || 0} 个
              {payload.recallSource ? ` · 召回 ${payload.recallSource}` : ""}
              {payload.graphSource ? ` · 图谱 ${payload.graphSource === "neo4j" ? "Neo4j" : "内存"}` : ""}
              {payload.neo4j?.synced && payload.neo4j.message ? ` · ${payload.neo4j.message}` : ""}
              {payload.neo4j && !payload.neo4j.synced && payload.neo4j.reason
                ? ` · Neo4j 未同步（${payload.neo4j.reason}）`
                : ""}
            </p>
          ) : payload.graphSource || payload.neo4j ? (
            <p className="result-text">
              {payload.graphSource ? `图谱来源：${payload.graphSource === "neo4j" ? "Neo4j" : "内存"}` : null}
              {payload.neo4j?.synced && payload.neo4j.message ? ` · ${payload.neo4j.message}` : ""}
              {payload.neo4j && !payload.neo4j.synced && payload.neo4j.reason
                ? ` · Neo4j 未同步（${payload.neo4j.reason}）`
                : ""}
            </p>
          ) : null}

          <div className="analysis-report-view">
            {!hasResult && !running ? (
              <p className="result-text">
                输入一个对象（如某公司、某股票、某政策）后执行。系统会检索关联资料、梳理事件与影响关系。
                {payload.intel && (payload.intel.articlesIngested ?? 0) === 0
                  ? "（提示：当前未取到外部资料，可能是数据源未配置或本机未联网。）"
                  : ""}
              </p>
            ) : null}

            {payload.briefing ? (
              payload.briefing.available ? (
                <div className="object-briefing">
                  <div className="object-briefing-head">
                    <h3 className="object-briefing-title">研判 · {query}</h3>
                    {payload.briefing.persona ? (
                      <span className="object-briefing-persona">{payload.briefing.persona}</span>
                    ) : null}
                  </div>
                  <p className="object-briefing-what">{payload.briefing.whatItIs}</p>

                  {/* 分析维度 */}
                  {(payload.briefing.risks?.length || payload.briefing.recent?.length) ? (
                    <div className="ob-dim ob-dim-analysis">
                      <span className="ob-dim-title">分析</span>
                      {payload.briefing.risks?.length ? (
                        <div className="object-briefing-block">
                          <span className="object-briefing-label">关键风险</span>
                          <ul>{payload.briefing.risks.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                      ) : null}
                      {payload.briefing.recent?.length ? (
                        <div className="object-briefing-block">
                          <span className="object-briefing-label">近期动态</span>
                          <ul>{payload.briefing.recent.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 逻辑维度 */}
                  {(payload.briefing.logic?.length || payload.briefing.misconceptions?.length) ? (
                    <div className="ob-dim ob-dim-logic">
                      <span className="ob-dim-title">逻辑</span>
                      {payload.briefing.logic?.length ? (
                        <div className="object-briefing-block">
                          <span className="object-briefing-label">运行逻辑</span>
                          <ul>{payload.briefing.logic.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                      ) : null}
                      {payload.briefing.misconceptions?.length ? (
                        <div className="object-briefing-block">
                          <span className="object-briefing-label">认知误区</span>
                          <ul>{payload.briefing.misconceptions.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 操作维度 */}
                  {(payload.briefing.conclusion || payload.briefing.foresight?.length || payload.briefing.entryExit?.length) ? (
                    <div className="ob-dim ob-dim-action">
                      <span className="ob-dim-title">操作</span>
                      {payload.briefing.conclusion ? (
                        <p className="ob-conclusion">{payload.briefing.conclusion}</p>
                      ) : null}
                      {payload.briefing.foresight?.length ? (
                        <div className="object-briefing-block">
                          <span className="object-briefing-label">预判</span>
                          <ul>{payload.briefing.foresight.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                      ) : null}
                      {payload.briefing.entryExit?.length ? (
                        <div className="object-briefing-block">
                          <span className="object-briefing-label">进退判断</span>
                          <ul>{payload.briefing.entryExit.map((t, i) => <li key={i}>{t}</li>)}</ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {payload.briefing.isFinance ? (
                    <p className="object-briefing-disclaimer">以上为信息整理与逻辑分析，不构成投资建议。</p>
                  ) : null}
                </div>
              ) : hasResult || payload.briefing.reason ? (
                <p className="result-text object-briefing-fallback">研判未生成：{payload.briefing.reason}</p>
              ) : null
            ) : null}

            {(payload.nodes || []).length ? (
              <div className="report-document">
                <ReportSection title="相关事件" count={payload.nodes!.length} defaultOpen>
                  <ul className="analysis-event-list">
                    {(payload.nodes || [])
                      .slice()
                      .sort((a, b) => (b.severity || 0) - (a.severity || 0))
                      .map((n) => (
                        <li key={n.id} className="analysis-event-item">
                          <p className="analysis-event-title">{n.title || n.id}</p>
                          {n.summary ? <p className="analysis-event-summary">{n.summary}</p> : null}
                          <p className="analysis-event-meta">
                            {n.severity ? `冲击 ${n.severity}` : ""}
                            {n.occurredAt ? ` · ${formatWhen(n.occurredAt)}` : ""}
                          </p>
                        </li>
                      ))}
                  </ul>
                </ReportSection>

                {(payload.edges || []).length ? (
                  <ReportSection title="影响关联" count={payload.edges!.length} defaultOpen>
                    <AnalysisRelationsList nodes={payload.nodes || []} edges={payload.edges || []} />
                  </ReportSection>
                ) : null}

                {influences.length ? (
                  <ReportSection title="影响关系说明" count={influences.length}>
                    <InfluenceRelationList items={influences} />
                  </ReportSection>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="analysis-history home-history">
          <div className="panel-header">
            <h3 className="reading-block-title">历史记录</h3>
            <button type="button" className="btn btn-secondary" onClick={() => void loadHistory().then(setHistory)}>
              刷新
            </button>
          </div>
          <p className="result-text home-history-hint">侧栏选择历史分析；脉络图右上角可更新当前主题事件。</p>
          {historyLoading ? <p className="result-text">加载历史…</p> : null}
          {!historyLoading && !history.length ? (
            <p className="result-text">暂无历史，完成一次分析后会出现。</p>
          ) : null}
          <ul className="history-list report-history-list">
            {history.map((item) => (
              <li key={item.sessionId}>
                <button
                  type="button"
                  className={`history-item-btn${activeSessionId === item.sessionId ? " is-active" : ""}`}
                  onClick={() => void openSession(item.sessionId)}
                >
                  <span className="history-item-title">
                    {item.query}
                    {item.secondaryQuery ? ` × ${item.secondaryQuery}` : ""}
                  </span>
                  <span className="history-item-meta history-item-meta-compact">
                    {formatWhen(item.updatedAt || item.createdAt)}
                    {item.preview ? ` · ${item.preview}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </section>
  );
}
