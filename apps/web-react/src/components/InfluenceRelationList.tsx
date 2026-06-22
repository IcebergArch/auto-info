type Influence = {
  id: string;
  label?: string;
  tone?: string;
};

function toneClass(tone?: string) {
  if (tone === "negative") return "relation-tone-negative";
  if (tone === "positive") return "relation-tone-positive";
  return "relation-tone-neutral";
}

export function InfluenceRelationList({ items }: { items: Influence[] }) {
  if (!items.length) return null;

  const seen = new Set<string>();
  const rows = items.filter((item) => {
    const text = String(item.influence || item.label || "").trim();
    if (!text || seen.has(text)) return false;
    seen.add(text);
    return true;
  });

  return (
    <div className="influence-relation-block">
      <h4 className="reading-block-title">跨线影响</h4>
      <ul className="analysis-relation-list compact influence-relation-list-readable">
        {rows.map((item) => (
          <li key={item.id} className={`analysis-relation-item ${toneClass(item.tone)}`}>
            <span className="analysis-relation-arrow" aria-hidden>
              →
            </span>
            <div className="analysis-relation-body">
              <p className="analysis-relation-label" title={item.influence || item.label}>
                {item.influence || item.label || "事件影响"}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
