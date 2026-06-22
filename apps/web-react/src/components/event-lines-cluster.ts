import type { LinePoint } from "./EventLinesChart";

export type PlottedPoint = {
  id: string;
  cx: number;
  cy: number;
  laneId: string;
  laneLabel: string;
  point: LinePoint;
  isMain: boolean;
};

/** 时间轴横向聚类阈值（SVG 坐标 px，随缩放由调用方传入） */
export function clusterXThresholdPx(viewSpanMs: number, plotWidthPx: number) {
  const msPerPx = viewSpanMs / Math.max(1, plotWidthPx);
  return Math.max(10, Math.min(28, msPerPx * 14));
}

export function buildPlotClusters(points: PlottedPoint[], xThresholdPx: number) {
  const sorted = points.slice().sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  const clusters: PlottedPoint[][] = [];
  const used = new Set<string>();

  for (const point of sorted) {
    if (used.has(point.id)) continue;
    const group = sorted.filter(
      (other) => !used.has(other.id) && Math.abs(other.cx - point.cx) <= xThresholdPx
    );
    for (const item of group) used.add(item.id);
    clusters.push(group);
  }

  return clusters;
}

export function clusterIdMap(clusters: PlottedPoint[][]) {
  const map = new Map<string, string[]>();
  for (const group of clusters) {
    const ids = group.map((item) => item.id);
    for (const item of group) {
      map.set(item.id, ids);
    }
  }
  return map;
}

export function resolveClusterIds(pointId: string, clusterMap: Map<string, string[]>) {
  return clusterMap.get(pointId) || [pointId];
}

export function isSameSelection(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}
