import type { ReactNode } from "react";

export type WorkspaceHeroStat = {
  label: string;
  value: ReactNode;
  tone?: "default" | "accent" | "muted";
};

export function WorkspaceHero({
  eyebrow,
  title,
  description,
  stats = [],
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  stats?: WorkspaceHeroStat[];
  actions?: ReactNode;
}) {
  return (
    <header className="workspace-hero">
      <div className="workspace-hero-copy">
        {eyebrow ? <span className="workspace-hero-eyebrow">{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="workspace-hero-side">
        {stats.length ? (
          <dl className="workspace-focus-strip" aria-label={`${title} 状态`}>
            {stats.map((item) => (
              <div key={item.label} className={`workspace-focus-pill tone-${item.tone || "default"}`}>
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {actions ? <div className="workspace-hero-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
