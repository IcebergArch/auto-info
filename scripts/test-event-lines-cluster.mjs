#!/usr/bin/env node
/** 脉络图横向聚类逻辑（与 event-lines-cluster.ts 保持一致） */

function buildPlotClusters(points, xThresholdPx) {
  const sorted = points.slice().sort((a, b) => a.cx - b.cx || a.cy - b.cy);
  const clusters = [];
  const used = new Set();
  for (const point of sorted) {
    if (used.has(point.id)) continue;
    const group = sorted.filter((other) => !used.has(other.id) && Math.abs(other.cx - point.cx) <= xThresholdPx);
    for (const item of group) used.add(item.id);
    clusters.push(group);
  }
  return clusters;
}

function clusterIdMap(clusters) {
  const map = new Map();
  for (const group of clusters) {
    const ids = group.map((item) => item.id);
    for (const item of group) map.set(item.id, ids);
  }
  return map;
}

function resolveClusterIds(pointId, clusterMap) {
  return clusterMap.get(pointId) || [pointId];
}

function isSameSelection(a, b) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

const points = [
  { id: "a", cx: 100, cy: 50 },
  { id: "b", cx: 108, cy: 90 },
  { id: "c", cx: 200, cy: 50 }
];

const clusters = buildPlotClusters(points, 14);
const map = clusterIdMap(clusters);
const ab = resolveClusterIds("a", map);
const c = resolveClusterIds("c", map);

let failed = 0;
if (ab.length !== 2 || !ab.includes("a") || !ab.includes("b")) {
  console.error("[test:event-lines-cluster] fail: cluster ab");
  failed += 1;
} else {
  console.log("[test:event-lines-cluster] ok: cluster nearby x");
}

if (c.length !== 1 || c[0] !== "c") {
  console.error("[test:event-lines-cluster] fail: single c");
  failed += 1;
} else {
  console.log("[test:event-lines-cluster] ok: isolated point");
}

if (!isSameSelection(ab, ["b", "a"]) || isSameSelection(ab, ["a"])) {
  console.error("[test:event-lines-cluster] fail: isSameSelection");
  failed += 1;
} else {
  console.log("[test:event-lines-cluster] ok: isSameSelection");
}

if (failed) process.exit(1);
console.log("[test:event-lines-cluster] done");
