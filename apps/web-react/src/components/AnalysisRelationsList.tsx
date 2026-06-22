type AnalysisNode = {
  id: string;
  title?: string;
  occurredAt?: string;
};

type AnalysisEdge = {
  id?: string;
  from: string;
  to: string;
  label?: string;
  tone?: string;
  influence?: string;
};

function toneClass(tone?: string) {
  if (tone === "negative") return "relation-tone-negative";
  if (tone === "positive") return "relation-tone-positive";
  return "relation-tone-neutral";
}

export function AnalysisRelationsList({
  nodes,
  edges
}: {
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
}) {
  const titleById = new Map(nodes.map((node) => [node.id, node.title || node.id]));

  if (!edges.length) {
    return <p className="result-text">暂无关联关系。</p>;
  }

  return (
    <ul className="analysis-relation-list">
      {edges.map((edge, index) => {
        const fromTitle = titleById.get(edge.from) || edge.from;
        const toTitle = titleById.get(edge.to) || edge.to;
        const text = edge.influence || edge.label || "关联";
        return (
          <li key={edge.id || `rel-${index}`} className={`analysis-relation-item ${toneClass(edge.tone)}`}>
            <div className="analysis-relation-arrow" aria-hidden>
              →
            </div>
            <div className="analysis-relation-body">
              <p className="analysis-relation-nodes">
                <span>{fromTitle}</span>
                <span className="analysis-relation-mid">→</span>
                <span>{toTitle}</span>
              </p>
              <p className="analysis-relation-label">{text}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
