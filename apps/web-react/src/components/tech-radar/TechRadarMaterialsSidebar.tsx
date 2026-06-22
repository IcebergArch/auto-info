import { SourceJumpLink } from "../report/SourceJumpLink";

export type TechRadarMaterial = {
  id?: string;
  entryId?: string;
  title?: string;
  url?: string;
  provider?: string;
};

export function TechRadarMaterialsSidebar({
  materials,
  selectedTitle
}: {
  materials: TechRadarMaterial[];
  selectedTitle?: string;
}) {
  return (
    <aside className="tech-radar-materials reading-history">
      <div className="panel-header">
        <h3 className="reading-block-title">相关资料</h3>
      </div>
      {selectedTitle ? <p className="result-text tech-radar-materials-context">{selectedTitle}</p> : null}
      {!materials.length ? (
        <p className="result-text tech-radar-empty">—</p>
      ) : (
        <ul className="report-ref-list tech-radar-ref-list">
          {materials.map((item) => (
            <li key={item.id || item.url || item.title} className="report-ref-row">
              <div className="report-ref-title-block">
                <span className="report-ref-title">{item.title || item.url || "来源"}</span>
                {item.provider ? <span className="report-ref-meta">{item.provider}</span> : null}
              </div>
              <SourceJumpLink url={item.url} />
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
