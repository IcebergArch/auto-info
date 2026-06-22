export function SourceJumpLink({ url, label = "查看来源" }: { url?: string; label?: string }) {
  if (!url) return null;
  return (
    <a
      className="source-jump-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
    >
      <span className="source-jump-icon" aria-hidden>
        ↗
      </span>
    </a>
  );
}
