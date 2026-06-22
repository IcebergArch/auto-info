import { ReportSection } from "./report/ReportSection";
import { SourceJumpLink } from "./report/SourceJumpLink";

type Paper = {
  summary?: string;
  keyPoints?: string[];
  recommendations?: string[];
};

type SourceLinks = {
  webUrl?: string | null;
  pdfUrl?: string | null;
  videoUrl?: string | null;
  audioUrl?: string | null;
};

export function ReadingBriefDocument({
  paper,
  warnings = [],
  sourceName,
  sourceUrl,
  sources
}: {
  paper: Paper;
  warnings?: string[];
  sourceName?: string;
  sourceUrl?: string | null;
  sources?: SourceLinks | null;
}) {
  const keyPoints = (paper.keyPoints || []).filter(Boolean);
  const recommendations = (paper.recommendations || []).filter(Boolean);
  const links = [
    sourceUrl ? { label: "原文", url: sourceUrl } : null,
    sources?.webUrl && sources.webUrl !== sourceUrl ? { label: "网页", url: sources.webUrl } : null,
    sources?.pdfUrl && sources.pdfUrl !== sourceUrl ? { label: "PDF", url: sources.pdfUrl } : null,
    sources?.videoUrl && sources.videoUrl !== sourceUrl ? { label: "视频", url: sources.videoUrl } : null,
    sources?.audioUrl && sources.audioUrl !== sourceUrl ? { label: "音频", url: sources.audioUrl } : null
  ].filter(Boolean) as Array<{ label: string; url: string }>;

  return (
    <div className="report-document">
      {warnings.length ? (
        <ul className="report-warnings">
          {warnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {links.length || sourceName ? (
        <ReportSection title="原文来源" count={links.length || undefined} defaultOpen={false}>
          {sourceName ? <p className="reading-source-name">{sourceName}</p> : null}
          {links.length ? (
            <ul className="reading-source-links">
              {links.map((item) => (
                <li key={item.url}>
                  <span className="reading-source-label">{item.label}</span>
                  <a className="reading-source-url" href={item.url} target="_blank" rel="noreferrer">
                    {item.url}
                  </a>
                  <SourceJumpLink url={item.url} label={`打开${item.label}`} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="result-text">无外链，正文来自粘贴内容。</p>
          )}
          <p className="result-text reading-source-hint">来源标题/URL 可保留英文；上方摘要/要点/建议均为中文，细节请点链接查看原文。</p>
        </ReportSection>
      ) : null}
      <ReportSection title="摘要" defaultOpen>
        <p className="report-lead">{paper.summary || "暂无摘要"}</p>
      </ReportSection>
      <ReportSection title="要点" count={keyPoints.length} defaultOpen>
        {keyPoints.length ? (
          <ul className="report-bullet-list">
            {keyPoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="result-text">暂无要点</p>
        )}
      </ReportSection>
      <ReportSection title="建议" count={recommendations.length} defaultOpen>
        {recommendations.length ? (
          <ol className="report-number-list">
            {recommendations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        ) : (
          <p className="result-text">暂无建议</p>
        )}
      </ReportSection>
    </div>
  );
}
