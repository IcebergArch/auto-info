import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { WorkspaceHero } from "../components/report/WorkspaceHero";
import { TopicBriefingReport } from "../components/TopicBriefingReport";
import { openExternalUrl } from "../lib/open-external-url";
import {
  addKnowledge,
  backfillTopicSignals,
  createTopic,
  getTopic,
  getTopicSignals,
  listTopics,
  refreshTopicSignals,
  type KnowledgeKind,
  type Topic,
  type TopicSignal,
  type TopicSummary
} from "../lib/topicsApi";

const KNOWLEDGE_META: { kind: KnowledgeKind; label: string; hint: string }[] = [
  { kind: "takeaways", label: "结论", hint: "你对该议题的判断结论" },
  { kind: "reasoning", label: "逻辑", hint: "支撑结论的推理与依据" },
  { kind: "decisions", label: "决策", hint: "已决定采取的行动" }
];

const STATUS_LABEL: Record<string, string> = {
  active: "活跃",
  watching: "关注",
  archived: "归档"
};

function severityTone(sev?: number) {
  const s = sev ?? 0;
  return s >= 80 ? "high" : s >= 55 ? "watch" : "ambient";
}

function signalDateLabel(s: TopicSignal) {
  const d = new Date(s.occurredAt || s.time || 0);
  if (Number.isNaN(d.getTime()) || d.getTime() === 0) return "";
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function SignalRow({ s, rank }: { s: TopicSignal; rank?: number }) {
  const tone = severityTone(s.severity);
  const url = s.references?.find((r) => r.url)?.url;
  return (
    <li className="tq-signal">
      {rank != null ? (
        <span className={`tq-signal-rank tone-${tone}`}>{String(rank).padStart(2, "0")}</span>
      ) : (
        <span className="tq-signal-date">{signalDateLabel(s) || "—"}</span>
      )}
      <span className="tq-signal-body">
        <span className="tq-signal-title">
          {s.title}
          {(s.tags || []).includes("未核实") ? <span className="tq-signal-unverified">未核实</span> : null}
        </span>
        {s.summary ? <span className="tq-signal-desc">{s.summary}</span> : null}
        <span className="tq-signal-meta">
          {s.category ? <span className="tq-signal-cat">{s.category}</span> : null}
          {s.severity ? <span className={`tq-signal-sev tone-${tone}`}>冲击 {s.severity}</span> : null}
          {url ? (
            <button type="button" className="tq-signal-link" onClick={() => openExternalUrl(url)}>
              来源 ↗
            </button>
          ) : null}
        </span>
      </span>
    </li>
  );
}

export function TopicsPage() {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [signals, setSignals] = useState<TopicSignal[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createNote, setCreateNote] = useState("");
  const [draftKind, setDraftKind] = useState<KnowledgeKind>("takeaways");
  const [draftText, setDraftText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState("");

  const loadTopics = useCallback(async () => {
    try {
      const res = await listTopics();
      setTopics(res.topics);
      setActiveId((prev) => prev || res.topics.find((t) => t.status !== "archived")?.id || res.topics[0]?.id || "");
    } catch (e) {
      setError((e as Error).message || "议题列表加载失败");
    }
  }, []);

  const loadTopicDetail = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [detail, sig] = await Promise.all([getTopic(id), getTopicSignals(id)]);
      setTopic(detail.topic);
      setSignals(sig.signals);
    } catch (e) {
      setError((e as Error).message || "议题详情加载失败");
      setTopic(null);
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    if (activeId) void loadTopicDetail(activeId);
  }, [activeId, loadTopicDetail]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setCreateNote("");
    try {
      const res = await createTopic({ title });
      setNewTitle("");
      const intake = res.intake;
      if (intake) {
        if (intake.sourceCount && intake.sourceCount > 0) {
          setCreateNote(`已搜集 ${intake.sourceCount} 条来源，匹配 ${intake.matchCount ?? 0} 条信号`);
        } else if (intake.created) {
          setCreateNote(`已建立观察条目（外部来源暂未配置/无网，匹配 ${intake.matchCount ?? 0} 条）`);
        }
      }
      await loadTopics();
      setActiveId(res.topic.id);
    } catch (err) {
      setError((err as Error).message || "创建议题失败");
    } finally {
      setCreating(false);
    }
  };

  const onRefresh = async () => {
    if (!activeId) return;
    setRefreshing(true);
    try {
      await refreshTopicSignals(activeId);
      await Promise.all([loadTopics(), loadTopicDetail(activeId)]);
    } catch (err) {
      setError((err as Error).message || "刷新信号失败");
    } finally {
      setRefreshing(false);
    }
  };

  const onBackfill = async () => {
    if (!activeId) return;
    setBackfilling(true);
    setError("");
    try {
      await backfillTopicSignals(activeId);
      await Promise.all([loadTopics(), loadTopicDetail(activeId)]);
    } catch (err) {
      setError((err as Error).message || "回溯失败");
    } finally {
      setBackfilling(false);
    }
  };

  const onAddNote = async (e: FormEvent) => {
    e.preventDefault();
    const text = draftText.trim();
    if (!text || !activeId) return;
    setSavingNote(true);
    try {
      const res = await addKnowledge(activeId, draftKind, text);
      setTopic(res.topic);
      setDraftText("");
      await loadTopics();
    } catch (err) {
      setError((err as Error).message || "保存认知失败");
    } finally {
      setSavingNote(false);
    }
  };

  const activeTopics = topics.filter((t) => t.status !== "archived");
  const archivedTopics = topics.filter((t) => t.status === "archived");

  const impactBands = useMemo(() => {
    const high = signals.filter((s) => (s.severity ?? 0) >= 80).length;
    const watch = signals.filter((s) => (s.severity ?? 0) >= 55 && (s.severity ?? 0) < 80).length;
    const ambient = signals.length - high - watch;
    return { high, watch, ambient };
  }, [signals]);

  const categoryShares = useMemo(() => {
    const map = new Map<string, number>();
    signals.forEach((s) => {
      const c = (s.category || "").trim();
      if (c) map.set(c, (map.get(c) || 0) + 1);
    });
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [signals]);

  // 双轴：近期动态（最近30天，按冲击）+ 事件脉络（全部，按时间从早到晚）
  const { recentSignals, timelineSignals } = useMemo(() => {
    const RECENT_DAYS = 30;
    const cutoff = Date.now() - RECENT_DAYS * 24 * 3600 * 1000;
    const ts = (s: TopicSignal) => {
      const d = new Date(s.occurredAt || s.time || 0).getTime();
      return Number.isFinite(d) ? d : 0;
    };
    const isUnverified = (s: TopicSignal) => (s.tags || []).includes("未核实");
    const recent = signals
      .filter((s) => ts(s) >= cutoff && !isUnverified(s)) // 近期榜剔除无真实来源的占位条目
      .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));
    const timeline = [...signals].sort((a, b) => ts(a) - ts(b)); // 从早到晚演进
    return { recentSignals: recent, timelineSignals: timeline };
  }, [signals]);

  return (
    <section className="panel topics-layout">
      <WorkspaceHero
        eyebrow="烛龙 · 情报"
        title="烛龙 · 情报"
        description="睁眼为昼，照见你关注的领域。为关注的标签与议题持续、自动地拉取更新，主动汇集重大、对你有影响的事件——看见信号 → 评估影响 → 沉淀认知，跨天累积。"
        stats={[
          { label: "议题数", value: activeTopics.length, tone: "accent" },
          { label: "当前信号", value: signals.length },
          { label: "已沉淀认知", value: topic ? KNOWLEDGE_META.reduce((n, m) => n + (topic.knowledge[m.kind]?.length || 0), 0) : 0, tone: "muted" }
        ]}
        actions={
          <>
            <button type="button" className="btn btn-secondary" disabled={backfilling || !activeId} onClick={() => void onBackfill()}>
              {backfilling ? "回溯中…" : "回溯历史"}
            </button>
            <button type="button" className="btn btn-primary" disabled={refreshing || !activeId} onClick={() => void onRefresh()}>
              {refreshing ? "刷新中…" : "刷新信号"}
            </button>
          </>
        }
      />

      {error ? <p className="error-text">{error}</p> : null}

      <div className="topics-grid">
        {/* 左：议题导航 */}
        <aside className="topics-nav">
          <form className="topics-create" onSubmit={onCreate}>
            <input
              className="input"
              placeholder="+ 新建议题，如：美联储货币政策"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <button type="submit" className="btn btn-secondary" disabled={creating}>
              {creating ? "搜集中" : "新建"}
            </button>
          </form>
          {createNote ? <p className="topics-create-note">{createNote}</p> : null}

          <ul className="topics-list">
            {activeTopics.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`topic-item${t.id === activeId ? " is-active" : ""}`}
                  onClick={() => setActiveId(t.id)}
                >
                  <span className="topic-item-title">{t.title}</span>
                  <span className="topic-item-meta">
                    <span className="topic-chip">{STATUS_LABEL[t.status]}</span>
                    {t.signalCount > 0 ? <span className="topic-chip accent">{t.signalCount} 信号</span> : null}
                    {t.knowledgeCount > 0 ? <span className="topic-chip">{t.knowledgeCount} 认知</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {archivedTopics.length ? (
            <details className="topics-archived">
              <summary>归档 ({archivedTopics.length})</summary>
              <ul className="topics-list">
                {archivedTopics.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="topic-item is-archived" onClick={() => setActiveId(t.id)}>
                      <span className="topic-item-title">{t.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </aside>

        {/* 中：信号主区（影响压成顶部指标带 + 信号流） */}
        <div className="topics-workspace">
          {loading ? (
            <p className="result-text">读取议题…</p>
          ) : topic ? (
            <>
              <header className="topic-head">
                <h2 className="topic-head-title">{topic.title}</h2>
                <p className="topic-head-meta">
                  查询「{topic.query}」 · {signals.length} 条信号
                  {topic.lastReviewedAt ? ` · 上次研判 ${new Date(topic.lastReviewedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : " · 未刷新"}
                </p>
              </header>

              {/* 情报秘书呈报：研判而非罗列，置顶 */}
              <TopicBriefingReport
                briefing={topic.briefing}
                onGenerate={() => void onRefresh()}
                generating={refreshing}
              />

              {/* 影响指标带：紧凑一行，不再独占一栏 */}
              {signals.length ? (
                <div className="impact-strip" aria-label="影响概览">
                  <span className="impact-pill tone-high">高冲击 <b>{impactBands.high}</b></span>
                  <span className="impact-pill tone-watch">需关注 <b>{impactBands.watch}</b></span>
                  <span className="impact-pill tone-ambient">环境 <b>{impactBands.ambient}</b></span>
                  {categoryShares.length ? (
                    <span className="impact-divider" aria-hidden="true" />
                  ) : null}
                  {categoryShares.map((c) => (
                    <span key={c.label} className="impact-cat">{c.label}<i>{c.count}</i></span>
                  ))}
                </div>
              ) : null}

              {/* 信号流主体 */}
              {signals.length ? (
                <div className="signal-flow">
                  {recentSignals.length ? (
                    <section className="signal-section">
                      <p className="signal-section-label">近期动态 · 最近 30 天（{recentSignals.length}）</p>
                      <ol className="signal-rows">
                        {recentSignals.slice(0, 10).map((s, i) => (
                          <SignalRow key={s.id} s={s} rank={i + 1} />
                        ))}
                      </ol>
                    </section>
                  ) : (
                    <p className="tq-empty">最近 30 天暂无新信号，可点右上「刷新信号 / 回溯历史」拉取。</p>
                  )}
                  <section className="signal-section">
                    <p className="signal-section-label">事件脉络 · 从早到晚（{timelineSignals.length}）</p>
                    <ol className="signal-rows tq-timeline">
                      {timelineSignals.map((s) => (
                        <SignalRow key={`tl-${s.id}`} s={s} />
                      ))}
                    </ol>
                  </section>
                </div>
              ) : (
                <p className="tq-empty">该议题暂无匹配信号，点右上「刷新信号 / 回溯历史」拉取。</p>
              )}
            </>
          ) : (
            <p className="result-text">从左侧选择或新建一个议题开始。</p>
          )}
        </div>

        {/* 右：认知栏（沉淀输入 + 已沉淀展示，对应"能做什么"） */}
        <aside className="topics-knowledge">
          <div className="knowledge-head">
            <h3 className="reading-block-title">认知沉淀</h3>
            <span className="knowledge-head-hint">看懂之后，记下你的判断</span>
          </div>
          {topic ? (
            <>
              <form className="topic-note-form" onSubmit={onAddNote}>
                <div className="topic-note-kinds">
                  {KNOWLEDGE_META.map((m) => (
                    <button
                      key={m.kind}
                      type="button"
                      className={`topic-note-kind${draftKind === m.kind ? " is-active" : ""}`}
                      onClick={() => setDraftKind(m.kind)}
                      title={m.hint}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <textarea
                  className="input topic-note-input"
                  rows={2}
                  placeholder={KNOWLEDGE_META.find((m) => m.kind === draftKind)?.hint}
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                />
                <button type="submit" className="btn btn-primary" disabled={savingNote || !draftText.trim()}>
                  {savingNote ? "保存中" : `沉淀为${KNOWLEDGE_META.find((m) => m.kind === draftKind)?.label}`}
                </button>
              </form>

              {KNOWLEDGE_META.map((m) => {
                const notes = topic.knowledge[m.kind] || [];
                return (
                  <div key={m.kind} className="knowledge-group">
                    <div className="knowledge-group-head">
                      <span className="knowledge-group-label">{m.label}</span>
                      <span className="knowledge-group-count">{notes.length}</span>
                    </div>
                    {notes.length ? (
                      <ul className="knowledge-list">
                        {notes.map((n) => (
                          <li key={n.id} className="knowledge-note">
                            {n.text}
                            <span className="knowledge-note-time">
                              {new Date(n.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="knowledge-empty">尚未沉淀{m.label}</p>
                    )}
                  </div>
                );
              })}
            </>
          ) : (
            <p className="result-text">选择议题后查看已沉淀的结论、逻辑与决策。</p>
          )}
        </aside>
      </div>
    </section>
  );
}
