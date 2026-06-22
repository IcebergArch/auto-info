/** 脉络图箭头：短标签（图上）与完整说明（列表 / tooltip） */

export function compactImpactChartLabel(influence, edgeLabel) {
  const shortLabel = String(edgeLabel || "").trim();
  if (shortLabel && shortLabel.length <= 24) return shortLabel;

  const raw = String(influence || shortLabel || "").trim();
  if (!raw) return "外溢影响";

  const sharedTag = raw.match(/标签[「『]([^」』]+)[」』]/);
  if (sharedTag && /观察簇|联合跟踪|传导/.test(raw)) {
    return `同簇·${sharedTag[1]}`;
  }

  const sameCat = raw.match(/同属[「『]([^」』]+)[」』]/);
  if (sameCat && /维度|强化/.test(raw)) {
    return `同类·${sameCat[1]}`;
  }

  const theme = raw.match(/在[「『]([^」』]+)[」』]层面/);
  if (theme) return `共振·${theme[1]}`;

  if (/关键词重叠/.test(raw)) {
    const kw = raw.match(/（([^）]+)）/);
    return kw ? `关键词·${kw[1].slice(0, 14)}` : "关键词重叠";
  }

  if (/交叉影响/.test(raw)) {
    const q = raw.match(/「([^」]+)」/);
    return q ? `交叉·${q[1].slice(0, 12)}` : "交叉影响";
  }

  const cleaned = raw.replace(/^【[^】]+】/, "").replace(/；依据：.*$/, "").trim();
  if (cleaned.length <= 24) return cleaned;
  return `${cleaned.slice(0, 22)}…`;
}

export function impactLabelFull(influence, edgeLabel, fallback = "外溢影响") {
  const full = String(influence || edgeLabel || "").trim();
  return full || fallback;
}
