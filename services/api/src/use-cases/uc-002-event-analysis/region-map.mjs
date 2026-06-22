/** 分析脉络 — 地区聚合（无世界地图渲染） */

const WORLD_REGION_DEFS = [
  { id: "americas", label: "美洲", cx: 92, cy: 118 },
  { id: "europe", label: "欧洲", cx: 248, cy: 72 },
  { id: "middle-east", label: "中东", cx: 292, cy: 98 },
  { id: "africa", label: "非洲", cx: 268, cy: 142 },
  { id: "asia", label: "亚洲", cx: 368, cy: 88 },
  { id: "oceania", label: "澳大拉西亚", cx: 412, cy: 158 }
];

const REGION_PATTERNS = [
  { id: "americas", re: /美洲|美国|美方|华盛顿|纽约|巴西|加拿大|latin|u\.s\.|united states/i },
  { id: "europe", re: /欧洲|欧盟|英国|法国|德国|乌克兰|俄罗斯|俄|乌|北约|nato|ukraine|russia|germany|france|uk\b/i },
  { id: "middle-east", re: /中东|以色列|伊朗|沙特|叙利亚|也门|gaza|israel|iran|saudi/i },
  { id: "africa", re: /非洲|南非|尼日利亚|埃及|苏丹|africa/i },
  { id: "asia", re: /亚洲|中国|日本|韩国|印度|东南亚|亚太|台海|朝鲜|china|japan|korea|india|asia/i },
  { id: "oceania", re: /澳大利亚|澳洲|新西兰|oceania|australia|new zealand/i }
];

export function normalizeWorldRegion(region, event = {}) {
  const corpus = `${region || ""} ${event.title || ""} ${event.summary || ""} ${(event.tags || []).join(" ")}`;
  for (const { id, re } of REGION_PATTERNS) {
    if (re.test(corpus)) return id;
  }
  return "europe";
}

export function buildMapLayer(nodes = [], events = []) {
  const byId = new Map(WORLD_REGION_DEFS.map((def) => [def.id, { ...def, eventCount: 0, maxSeverity: 0 }]));
  const source = nodes.length ? nodes : events;

  for (const item of source) {
    const regionId = normalizeWorldRegion(item.region, item);
    const bucket = byId.get(regionId);
    if (!bucket) continue;
    bucket.eventCount += 1;
    bucket.maxSeverity = Math.max(bucket.maxSeverity, Number(item.severity || 0));
  }

  const maxCount = Math.max(1, ...[...byId.values()].map((r) => r.eventCount));
  const regions = [...byId.values()].map((region) => ({
    id: region.id,
    label: region.label,
    cx: region.cx,
    cy: region.cy,
    eventCount: region.eventCount,
    intensity: region.eventCount ? Math.min(1, 0.25 + (region.eventCount / maxCount) * 0.75) : 0.08
  }));

  return { regions };
}

export const DIMENSION_LAYER_SPECS = [
  { dimension: "policy", label: "政治", depth: 1, zOffset: 48 },
  { dimension: "market", label: "金融", depth: 2, zOffset: 96 },
  { dimension: "technology", label: "科技", depth: 3, zOffset: 144 }
];
