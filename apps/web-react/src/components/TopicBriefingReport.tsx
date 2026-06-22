import { useMemo } from "react";
import type { TopicBriefing } from "../lib/topicsApi";

type Edge = { from: string; label: string; to: string }; // from/to 为节点 id
type ParsedGraph = { edges: Edge[]; labelOf: Record<string, string> };

/**
 * 解析 mermaid flowchart：先建 节点id→中文标签 字典（节点可能单独定义），
 * 再按 id 解析边。修复"D/F/H 字母节点未还原成中文"的问题。
 */
function parseMermaid(src: string): ParsedGraph {
  if (!src) return { edges: [], labelOf: {} };
  const labelOf: Record<string, string> = {};
  // 收集所有 形如 X["中文"] / X[中文] / X("中文") 的节点定义
  const defRe = /([A-Za-z0-9_]+)\s*[[(]+\s*["']?([^"'\])]+)["']?\s*[\])]+/g;
  let dm: RegExpExecArray | null;
  while ((dm = defRe.exec(src))) {
    labelOf[dm[1]] = dm[2].trim();
  }
  const edges: Edge[] = [];
  const edgeRe = /([A-Za-z0-9_]+)(?:[[(]+[^\])]*[\])]+)?\s*--+>\s*(?:\|([^|]*)\|)?\s*([A-Za-z0-9_]+)(?:[[(]+[^\])]*[\])]+)?/g;
  let em: RegExpExecArray | null;
  for (const line of src.split(/\n|;/)) {
    edgeRe.lastIndex = 0;
    if ((em = edgeRe.exec(line))) {
      const from = em[1];
      const to = em[3];
      const label = (em[2] || "").trim();
      if (from && to && from !== to) edges.push({ from, label, to });
    }
  }
  return { edges, labelOf };
}

type Node = { id: string; label: string; x: number; y: number };

/** 拓扑分层：原因在左，结果在右；同层纵向铺开。消除圆环堆叠。 */
function layeredLayout(edges: Edge[], labelOf: Record<string, string>, colW: number, rowH: number, padX: number, padY: number) {
  const ids = new Set<string>();
  edges.forEach((e) => { ids.add(e.from); ids.add(e.to); });
  const incoming: Record<string, number> = {};
  const adj: Record<string, string[]> = {};
  ids.forEach((id) => { incoming[id] = 0; adj[id] = []; });
  edges.forEach((e) => { adj[e.from].push(e.to); incoming[e.to] += 1; });

  // 最长路径分层（Kahn 变体）：层 = 从源头到该节点的最长距离
  const depth: Record<string, number> = {};
  ids.forEach((id) => { depth[id] = 0; });
  const indeg = { ...incoming };
  const queue = [...ids].filter((id) => indeg[id] === 0);
  // 防环：最多迭代 节点数*层数
  let guard = ids.size * ids.size + 10;
  while (queue.length && guard-- > 0) {
    const u = queue.shift() as string;
    for (const v of adj[u]) {
      depth[v] = Math.max(depth[v], depth[u] + 1);
      if (--indeg[v] === 0) queue.push(v);
    }
  }

  // 按层分组
  const layers: Record<number, string[]> = {};
  [...ids].forEach((id) => {
    (layers[depth[id]] = layers[depth[id]] || []).push(id);
  });
  const maxLayer = Math.max(0, ...Object.keys(layers).map(Number));

  const nodes: Record<string, Node> = {};
  for (let d = 0; d <= maxLayer; d++) {
    const col = layers[d] || [];
    col.forEach((id, i) => {
      nodes[id] = {
        id,
        label: labelOf[id] || id,
        x: padX + d * colW,
        y: padY + i * rowH + ((maxLayer >= 0 ? 0 : 0))
      };
    });
  }
  const maxRows = Math.max(1, ...Object.values(layers).map((c) => c.length));
  return { nodes, nodeList: [...ids].map((id) => nodes[id]), cols: maxLayer + 1, rows: maxRows };
}

function RelationGraph({ edges, labelOf }: { edges: Edge[]; labelOf: Record<string, string> }) {
  const colW = 230;
  const rowH = 64;
  const padX = 70;
  const padY = 36;
  const { nodes, nodeList, cols, rows } = useMemo(
    () => layeredLayout(edges, labelOf, colW, rowH, padX, padY),
    [edges, labelOf]
  );

  if (!edges.length) return null;

  const W = padX * 2 + Math.max(0, cols - 1) * colW;
  const H = padY * 2 + Math.max(0, rows - 1) * rowH + 20;
  const clip = (s: string, n = 11) => (s.length > n ? `${s.slice(0, n)}…` : s);

  return (
    <svg className="briefing-graph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="事件影响链">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--accent)" />
        </marker>
      </defs>
      {edges.map((e, i) => {
        const a = nodes[e.from];
        const b = nodes[e.to];
        if (!a || !b) return null;
        // 从 a 右侧连到 b 左侧（分层后多数边向右）；用折线更清晰
        const x1 = a.x + 8;
        const y1 = a.y;
        const x2 = b.x - 8;
        const y2 = b.y;
        const mx = (x1 + x2) / 2;
        return (
          <g key={i}>
            <path
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              className="briefing-graph-edge"
              fill="none"
              markerEnd="url(#arrow)"
            />
            {e.label ? (
              <text x={mx} y={(y1 + y2) / 2 - 4} className="briefing-graph-edge-label" textAnchor="middle">
                {clip(e.label, 8)}
              </text>
            ) : null}
          </g>
        );
      })}
      {nodeList.map((n) => {
        const text = clip(n.label);
        const w = text.length * 13 + 16;
        return (
          <g key={n.id}>
            <rect x={n.x - w / 2} y={n.y - 13} width={w} height={26} rx="6" className="briefing-graph-node-box" />
            <text x={n.x} y={n.y + 4} className="briefing-graph-node-label" textAnchor="middle">
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function TopicBriefingReport({
  briefing,
  onGenerate,
  generating
}: {
  briefing?: TopicBriefing | null;
  onGenerate?: () => void;
  generating?: boolean;
}) {
  const { edges, labelOf } = useMemo(() => parseMermaid(briefing?.mermaid || ""), [briefing?.mermaid]);

  // 始终可见：无呈报时给出生成引导，而非静默消失
  if (!briefing || !briefing.available) {
    return (
      <div className="briefing briefing-fallback">
        <div className="briefing-head">
          <span className="briefing-eyebrow">情报秘书呈报</span>
          {onGenerate ? (
            <button type="button" className="btn btn-secondary briefing-gen-btn" disabled={generating} onClick={onGenerate}>
              {generating ? "研判中…" : "生成研判"}
            </button>
          ) : null}
        </div>
        <p className="briefing-reason">
          {briefing?.reason || "尚未生成研判。点「生成研判」或刷新信号，由情报秘书综合信号给出判断、态势与关联图。"}
        </p>
      </div>
    );
  }

  return (
    <section className="briefing" aria-label="情报秘书呈报">
      <div className="briefing-head">
        <span className="briefing-eyebrow">情报秘书呈报</span>
        <span className="briefing-head-right">
          {briefing.generatedAt ? (
            <span className="briefing-time">
              {new Date(briefing.generatedAt).toLocaleString("zh-CN", {
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              })}
              {typeof briefing.recentCount === "number" ? ` · 近期 ${briefing.recentCount} / 历史 ${briefing.historyCount ?? 0}` : ""}
            </span>
          ) : null}
          {onGenerate ? (
            <button type="button" className="briefing-regen" disabled={generating} onClick={onGenerate}>
              {generating ? "…" : "重研判"}
            </button>
          ) : null}
        </span>
      </div>

      {briefing.verdict ? <p className="briefing-verdict">{briefing.verdict}</p> : null}

      {briefing.trend ? (
        <p className="briefing-trend">
          <span className="briefing-label">态势</span>
          {briefing.trend}
        </p>
      ) : null}

      {briefing.clusters?.length ? (
        <div className="briefing-block">
          <span className="briefing-label">要点归纳</span>
          <ul className="briefing-clusters">
            {briefing.clusters.map((c, i) => (
              <li key={i}>
                <span className="briefing-cluster-theme">{c.theme}</span>
                <span className="briefing-cluster-gist">{c.gist}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {edges.length ? (
        <div className="briefing-block">
          <span className="briefing-label">关联图</span>
          <RelationGraph edges={edges} labelOf={labelOf} />
        </div>
      ) : null}

      {(briefing.conclusion || briefing.foresight?.length || briefing.entryExit?.length || briefing.cognitiveCheck?.length) ? (
        <div className="briefing-decision">
          <span className="briefing-decision-title">决策视角</span>
          {briefing.conclusion ? <p className="briefing-conclusion">{briefing.conclusion}</p> : null}
          {briefing.foresight?.length ? (
            <div className="briefing-block">
              <span className="briefing-label tone-foresight">预判 · 布局</span>
              <ul className="briefing-watch">
                {briefing.foresight.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ) : null}
          {briefing.entryExit?.length ? (
            <div className="briefing-block">
              <span className="briefing-label tone-entryexit">进退信号</span>
              <ul className="briefing-watch">
                {briefing.entryExit.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ) : null}
          {briefing.cognitiveCheck?.length ? (
            <div className="briefing-block">
              <span className="briefing-label tone-cognitive">认知校验</span>
              <ul className="briefing-watch">
                {briefing.cognitiveCheck.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
