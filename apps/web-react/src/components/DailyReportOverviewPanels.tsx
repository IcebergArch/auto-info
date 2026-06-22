import type { ReactNode } from "react";

export type OverviewPanel = {
  title?: string;
  points?: string[];
};

export type OverviewPanelsMap = {
  international?: OverviewPanel;
  technology?: OverviewPanel;
  finance?: OverviewPanel;
};

const PANEL_DEFS = [
  { key: "international" as const, title: "国际局势" },
  { key: "technology" as const, title: "科技" },
  { key: "finance" as const, title: "金融" }
];

const FALLBACK_POINTS: Record<(typeof PANEL_DEFS)[number]["key"], string> = {
  international: "暂无突出新增",
  technology: "暂无突出新增",
  finance: "暂无显著变化"
};

function parseBulletLine(text: string) {
  const idx = text.indexOf("：");
  if (idx > 0 && idx <= 8) {
    return { label: text.slice(0, idx), body: text.slice(idx + 1).trim() };
  }
  return { label: "", body: text };
}

function pointsFromLegacyBullet(bullets: string[], label: string) {
  const line = bullets.find((item) => item.startsWith(`${label}：`));
  if (!line) return [];
  const parsed = parseBulletLine(line);
  const body = parsed.body || line.replace(new RegExp(`^${label}：`), "").trim();
  if (!body || /暂无/.test(body)) return [];
  return body
    .split(/[；;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolvePanels(panels: OverviewPanelsMap | undefined, bullets: string[]) {
  return PANEL_DEFS.map((def) => {
    const fromApi = panels?.[def.key];
    const apiPoints = (fromApi?.points || []).map((p) => String(p).trim()).filter(Boolean);
    const legacyPoints = pointsFromLegacyBullet(bullets, def.title);
    const points = apiPoints.length ? apiPoints : legacyPoints.length ? legacyPoints : [FALLBACK_POINTS[def.key]];
    return {
      key: def.key,
      title: fromApi?.title || def.title,
      points
    };
  });
}

export function DailyReportOverviewPanels({
  summary,
  panels,
  bullets = [],
  footer
}: {
  summary?: string;
  panels?: OverviewPanelsMap;
  bullets?: string[];
  footer?: ReactNode;
}) {
  const resolved = resolvePanels(panels, bullets);

  return (
    <div className="report-overview-block">
      {summary ? <p className="report-lead">{summary}</p> : null}
      <div className="report-overview-panels" role="group" aria-label="概要分栏">
        {resolved.map((panel) => (
          <section key={panel.key} className="report-overview-panel" aria-labelledby={`overview-${panel.key}`}>
            <h4 id={`overview-${panel.key}`} className="report-overview-panel-title">
              {panel.title}
            </h4>
            <ul className="report-overview-panel-points">
              {panel.points.map((point, index) => (
                <li key={`${panel.key}-${index}`} className="report-overview-point">
                  {point}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {footer}
    </div>
  );
}
