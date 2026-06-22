import { useState, type ReactNode } from "react";

export function ReportSection({
  title,
  range,
  count,
  defaultOpen,
  children
}: {
  title: string;
  /** 起止时间，如 5.28 — 6.01 */
  range?: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <section className={`report-section${open ? " is-open" : ""}`}>
      <button type="button" className="report-section-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="report-section-title">
          {title}
          {range ? <span className="report-section-range">{range}</span> : null}
        </span>
        {count != null ? <span className="report-section-count">{count}</span> : null}
        <span className="report-section-action">{open ? "收起" : "展开"}</span>
      </button>
      {open ? <div className="report-section-body">{children}</div> : null}
    </section>
  );
}
