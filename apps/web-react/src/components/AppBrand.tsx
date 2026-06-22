type AppBrandProps = {
  onNavigateHome?: () => void;
  compact?: boolean;
};

const brandMarkUrl = "/favicon.svg";

export function AppBrand({ onNavigateHome, compact = false }: AppBrandProps) {
  const mark = (
    <img
      className="app-brand-mark"
      src={brandMarkUrl}
      width={compact ? 24 : 28}
      height={compact ? 24 : 28}
      alt=""
      decoding="async"
    />
  );

  const label = (
    <span className="app-brand-copy">
      <span className="app-brand-product">山海 · 情报站</span>
      {!compact ? <span className="app-brand-system">烛龙照见 · 白泽知物</span> : null}
    </span>
  );

  if (onNavigateHome) {
    return (
      <button type="button" className="app-brand" onClick={onNavigateHome} aria-label="返回首页">
        {mark}
        {label}
      </button>
    );
  }

  return (
    <div className="app-brand app-brand-static">
      {mark}
      {label}
    </div>
  );
}
