import { useMemo } from "react";
import type { DailyReportCardData } from "./DailyReportCard";
import {
  buildThreeQuestionModel,
  type ActionSuggestion,
  type SignalItem
} from "../lib/threeQuestions";
import { openExternalUrl } from "../lib/open-external-url";
import { useAppStore, type PageKey } from "../stores/useAppStore";

function SignalRow({ signal, rank }: { signal: SignalItem; rank: number }) {
  const tone = signal.severity >= 80 ? "high" : signal.severity >= 55 ? "watch" : "ambient";
  // 低密度信号（多为套话/无增量）弱化呈现，但不隐藏
  const lowDensity = signal.density < 40;
  return (
    <li className={`tq-signal${lowDensity ? " is-low-density" : ""}`}>
      <span className={`tq-signal-rank tone-${tone}`} aria-hidden="true">
        {String(rank).padStart(2, "0")}
      </span>
      <span className="tq-signal-body">
        <span className="tq-signal-title">
          {signal.title}
          {signal.dupCount > 0 ? (
            <span className="tq-signal-fold" title={`已合并 ${signal.dupCount} 条近似重复`}>
              +{signal.dupCount} 同类
            </span>
          ) : null}
        </span>
        {signal.desc ? <span className="tq-signal-desc">{signal.desc}</span> : null}
        <span className="tq-signal-meta">
          <span className="tq-signal-cat">{signal.category}</span>
          {signal.severity ? (
            <span className={`tq-signal-sev tone-${tone}`}>冲击 {signal.severity}</span>
          ) : null}
          {signal.url ? (
            <button
              type="button"
              className="tq-signal-link"
              onClick={() => openExternalUrl(signal.url as string)}
            >
              来源 ↗
            </button>
          ) : null}
        </span>
      </span>
    </li>
  );
}

export function ThreeQuestionLens({
  report,
  viewDate,
  loading
}: {
  report: DailyReportCardData | null;
  viewDate: string;
  loading: boolean;
}) {
  const setPage = useAppStore((s) => s.setPage);
  const model = useMemo(() => buildThreeQuestionModel(report, viewDate), [report, viewDate]);

  const onAction = (action: ActionSuggestion) => {
    if (action.target === "source" && action.url) {
      openExternalUrl(action.url);
      return;
    }
    const pageMap: Partial<Record<ActionSuggestion["target"], PageKey>> = {
      analysis: "analysis",
      reading: "reading",
      techRadar: "techRadar"
    };
    const page = pageMap[action.target];
    if (page) setPage(page);
  };

  if (loading && !report) {
    return (
      <section className="tq-lens" aria-label="三问透镜">
        <p className="tq-loading">读取信号中…</p>
      </section>
    );
  }

  const maxBand = Math.max(1, ...model.impactBands.map((b) => b.count));

  return (
    <section className="tq-lens" aria-label="情报三问">
      <p className="tq-headline">{model.headline}</p>
      <div className="tq-grid">
        {/* 发生了什么 */}
        <article className="tq-col tq-col-what">
          <header className="tq-col-head">
            <span className="tq-col-index" aria-hidden="true">
              01
            </span>
            <div className="tq-col-titles">
              <h3 className="tq-col-title">发生了什么</h3>
              <p className="tq-col-sub">{model.eventCount} 条信号 · 按冲击排序</p>
            </div>
          </header>
          {model.topSignals.length ? (
            <ol className="tq-signal-list">
              {model.topSignals.map((s, i) => (
                <SignalRow key={s.id} signal={s} rank={i + 1} />
              ))}
            </ol>
          ) : (
            <p className="tq-empty">暂无信号，等待来源刷新或主动检索。</p>
          )}
        </article>

        {/* 影响是什么 */}
        <article className="tq-col tq-col-impact">
          <header className="tq-col-head">
            <span className="tq-col-index" aria-hidden="true">
              02
            </span>
            <div className="tq-col-titles">
              <h3 className="tq-col-title">影响是什么</h3>
              <p className="tq-col-sub">
                {model.highImpactCount ? `${model.highImpactCount} 条高冲击` : "暂无高冲击"}
              </p>
            </div>
          </header>
          {model.hasData ? (
            <>
              <ul className="tq-band-list">
                {model.impactBands.map((band) => (
                  <li key={band.key} className={`tq-band tone-${band.key}`}>
                    <span className="tq-band-label">{band.label}</span>
                    <span className="tq-band-bar" aria-hidden="true">
                      <i style={{ width: `${(band.count / maxBand) * 100}%` }} />
                    </span>
                    <span className="tq-band-count">{band.count}</span>
                  </li>
                ))}
              </ul>
              {model.categoryShares.length ? (
                <div className="tq-chip-row" aria-label="类别分布">
                  {model.categoryShares.map((c) => (
                    <span key={c.label} className="tq-chip">
                      {c.label}
                      <i>{c.count}</i>
                    </span>
                  ))}
                </div>
              ) : null}
              {model.regions.length ? (
                <p className="tq-regions">
                  <span className="tq-regions-label">涉及区域</span>
                  {model.regions.join(" · ")}
                </p>
              ) : null}
            </>
          ) : (
            <p className="tq-empty">无事件可评估影响。</p>
          )}
        </article>

        {/* 能做什么 */}
        <article className="tq-col tq-col-action">
          <header className="tq-col-head">
            <span className="tq-col-index" aria-hidden="true">
              03
            </span>
            <div className="tq-col-titles">
              <h3 className="tq-col-title">能做什么</h3>
              <p className="tq-col-sub">{model.actions.length} 个建议动作</p>
            </div>
          </header>
          {model.actions.length ? (
            <ul className="tq-action-list">
              {model.actions.map((action) => (
                <li key={action.key}>
                  <button type="button" className="tq-action" onClick={() => onAction(action)}>
                    <span className="tq-action-label">{action.label}</span>
                    <span className="tq-action-hint">{action.hint}</span>
                    <span className="tq-action-arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tq-empty">暂无建议动作。</p>
          )}
        </article>
      </div>
    </section>
  );
}
