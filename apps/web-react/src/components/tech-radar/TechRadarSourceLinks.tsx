import { SourceJumpLink } from "../report/SourceJumpLink";

export function TechRadarSourceLinks({
  sources,
  compact = false
}: {
  sources: Array<{ title?: string; url?: string; provider?: string }>;
  compact?: boolean;
}) {
  const rows = (sources || []).filter((s) => s.url && /^https?:\/\//i.test(s.url));
  if (!rows.length) return null;

  return (
    <ul className={`tech-radar-source-links${compact ? " is-compact" : ""}`}>
      {rows.map((item, index) => (
        <li key={`${item.url}-${index}`} className="tech-radar-source-row">
          <span className="tech-radar-source-title" title={item.title}>
            {item.title || item.url}
          </span>
          <SourceJumpLink url={item.url} label="打开来源" />
        </li>
      ))}
    </ul>
  );
}
