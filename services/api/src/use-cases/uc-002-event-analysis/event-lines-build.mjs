import {
  isIngestPlaceholderText,
  isTemplateFluff,
  presentEventForReport,
  resolveTimelinePointText
} from "../uc-001-daily-events/event-display.mjs";
import { compactImpactChartLabel, impactLabelFull } from "./impact-label.mjs";
import { isGeoConflictEvent, isTechAiQuery, matchesAnalysisQuery, matchesQuery } from "./match-query.mjs";
import { resolveAnalysisWindow } from "./analysis-window.mjs";
import { selectChartMilestones } from "./timeline-build.mjs";
import { buildTimeAxisScale, timeAxisMeta } from "./time-axis-scale.mjs";
import { buildMapLayer, DIMENSION_LAYER_SPECS } from "./region-map.mjs";

const CHART_WIDTH = 1000;
const LANE_HEIGHT = 64;

const IMPACT_LANE_ORDER = [
  { dimension: "policy", label: "政治" },
  { dimension: "market", label: "金融" },
  { dimension: "technology", label: "科技" }
];

function safeSlugLabel(text) {
  return String(text || "lane")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\u4e00-\u9fff-]/g, "")
    .slice(0, 20);
}

function dedupeInfluenceList(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = String(item.influence || item.label || item.id || "").trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeLanePoints(points) {
  const seen = new Set();
  return points
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .filter((point) => {
      const key = `${String(point.at || "").slice(0, 10)}|${String(point.title || "").slice(0, 48)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function mergeMainMilestones(mainPointsRaw, chronology, query) {
  if (!chronology) return mainPointsRaw;
  const milestones = chronology.chartMilestones?.length
    ? chronology.chartMilestones
    : selectChartMilestones(chronology, query);
  const merged = [...mainPointsRaw];
  for (const item of milestones) {
    merged.push({
      id: item.id || `ms-${merged.length}`,
      at: item.at,
      title: item.title,
      text: item.text || "",
      level: item.level || "core",
      severity: 88,
      eventId: item.eventId || "milestone"
    });
  }
  return dedupeLanePoints(merged);
}

function mapPointsWithX(points, y, timeScale, kind) {
  return points.map((point) => ({
    ...point,
    x: timeScale.toX(new Date(point.at).getTime(), CHART_WIDTH),
    y,
    kind
  }));
}

function collectLanePoints(event, startTs, endTs) {
  const occurredTs = new Date(event.occurredAt || 0).getTime();
  if (!Number.isFinite(occurredTs) || occurredTs < startTs || occurredTs > endTs) return [];

  const presented = presentEventForReport(event);
  let text = "";
  let title = presented.displayTitle || event.title;

  for (const point of event.timeline || []) {
    const raw = String(point.text || "").trim();
    if (!raw || isIngestPlaceholderText(raw) || /暂无新增原始事件/.test(raw)) continue;
    text = resolveTimelinePointText(event, point);
    const label = String(point.label || "").trim();
    if (label && label !== "来源") title = label;
    break;
  }

  if (!text) {
    text = presented.desc || presented.summary || "";
  }
  if (!text || isIngestPlaceholderText(text) || isTemplateFluff(text)) return [];

  return [
    {
      id: `${event.id}-chart`,
      at: new Date(occurredTs).toISOString(),
      title,
      text,
      level: event.level || (event.special ? "core" : "important"),
      severity: Number(event.severity || 70),
      eventId: event.id
    }
  ];
}

function techEventCorpus(event) {
  const timeline = (event.timeline || []).map((point) => point.text).join(" ");
  const refs = (event.references || []).map((ref) => ref.title).join(" ");
  return `${event.title || ""} ${event.summary || ""} ${timeline} ${refs}`.toLowerCase();
}

function isCoreTechLaneEvent(event, query) {
  if (!isTechAiQuery(query)) return false;
  if (!matchesAnalysisQuery(event, query) || isGeoConflictEvent(event)) return false;
  const corpus = techEventCorpus(event);
  if (/\bgpt\b|chatgpt|gpt-\d|openai|anthropic|claude|llm|大模型|foundation model|nvidia/i.test(corpus)) {
    return true;
  }
  return event.level === "core" || event.special || Number(event.severity || 0) >= 82;
}

function isInternalConflictEvent(event, query) {
  if (isTechAiQuery(query)) return isCoreTechLaneEvent(event, query);
  const text = `${event.title || ""} ${event.summary || ""}`;
  if (!matchesAnalysisQuery(event, query)) return false;
  if (event.level === "core" || event.special) return true;
  if (/冲突|战争|和谈|停火|占领|反攻|袭击|轰炸|前线|谈判|制裁升级|动员|撤军|炮击|无人机|导弹/.test(text)) return true;
  if ((event.dimension === "policy" || event.dimension === "risk") && /俄|乌|顿巴斯|克里米亚|NATO|军援/.test(text)) {
    return true;
  }
  return Number(event.severity || 0) >= 82 && matchesQuery(event, query);
}

function inferDimension(event) {
  let dim = event.dimension || "market";
  if (dim === "risk") dim = "policy";
  if (IMPACT_LANE_ORDER.some((lane) => lane.dimension === dim)) return dim;
  const corpus = `${event.title || ""} ${event.summary || ""}`.toLowerCase();
  if (/\bai\b|gpt|llm|大模型|算力|芯片|nvidia|openai/i.test(corpus)) return "technology";
  if (/政策|制裁|外交|和谈|协议|选举|监管/.test(corpus)) return "policy";
  return "market";
}

function buildImpactArrows(mainLane, impactLanes, graphEdges, eventById, timeScale) {
  const arrows = [];
  const keys = new Set();
  const mainY = mainLane.y;
  const laneByDim = new Map(impactLanes.map((lane) => [lane.dimension, lane]));
  const mainEventIds = new Set((mainLane.points || []).map((p) => p.eventId).filter(Boolean));

  for (const edge of graphEdges || []) {
    const fromEvent = eventById.get(edge.from);
    const toEvent = eventById.get(edge.to);
    if (!fromEvent || !toEvent) continue;

    const fromInternal = mainEventIds.has(edge.from) || isInternalConflictEvent(fromEvent, mainLane.label);
    const toInternal = mainEventIds.has(edge.to) || isInternalConflictEvent(toEvent, mainLane.label);
    if (fromInternal && toInternal) continue;

    const sourceEvent = fromInternal ? fromEvent : toInternal ? toEvent : null;
    const targetEvent = fromInternal ? toEvent : toInternal ? fromEvent : toEvent;
    if (!sourceEvent || !targetEvent) continue;

    const dim = inferDimension(targetEvent);
    const targetLane = laneByDim.get(dim);
    if (!targetLane) continue;

    const sourcePoint =
      (mainLane.points || []).find((p) => p.eventId === sourceEvent.id)
      || (mainLane.points || []).slice(-1)[0];
    const x = sourcePoint?.x ?? timeScale.toX(new Date(sourceEvent.occurredAt).getTime(), CHART_WIDTH);
    const key = `${edge.from}|${edge.to}|${dim}`;
    if (keys.has(key)) continue;
    keys.add(key);

    arrows.push({
      id: `arrow-${edge.from}-${edge.to}`,
      x,
      fromY: mainY,
      toY: targetLane.y,
      toLaneId: targetLane.id,
      toDimension: dim,
      label: compactImpactChartLabel(edge.influence, edge.label),
      labelFull: impactLabelFull(edge.influence, edge.label, compactImpactChartLabel(edge.influence, edge.label)),
      tone: edge.tone || "neutral",
      kind: "external"
    });
  }

  for (const lane of impactLanes) {
    for (const point of lane.points || []) {
      const key = `pt-${point.id}-${lane.id}`;
      if (keys.has(key)) continue;
      const nearestMain = (mainLane.points || [])
        .slice()
        .sort(
          (a, b) =>
            Math.abs(new Date(a.at).getTime() - new Date(point.at).getTime())
            - Math.abs(new Date(b.at).getTime() - new Date(point.at).getTime())
        )[0];
      const x = nearestMain?.x ?? point.x;
      keys.add(key);
      arrows.push({
        id: key,
        x,
        fromY: mainY,
        toY: lane.y,
        toLaneId: lane.id,
        toDimension: lane.dimension,
        label: compactImpactChartLabel(point.text, point.title),
        labelFull: impactLabelFull(point.text, point.title, "外溢影响"),
        tone: /成本|上行|承压|扰动|制裁|风险/.test(`${point.title} ${point.text}`) ? "negative" : "neutral",
        kind: "external"
      });
    }
  }

  return arrows.slice(0, 24);
}

function chronologyToStructured(chronology, query, timeScale) {
  const points = chronology?.chartMilestones?.length
    ? chronology.chartMilestones
    : selectChartMilestones(chronology, query);
  const mainLabel = String(query || "主事件").slice(0, 24);
  const mainY = LANE_HEIGHT / 2;
  const impactLanes = IMPACT_LANE_ORDER.map((spec, index) => ({
    id: `impact-${spec.dimension}`,
    dimension: spec.dimension,
    label: spec.label,
    kind: "impact",
    y: LANE_HEIGHT * (index + 1) + LANE_HEIGHT / 2,
    points: []
  }));

  const mainPoints = [];
  for (const point of points) {
    const item = {
      id: point.id || `ch-${mainPoints.length}`,
      at: point.at,
      title: point.title || point.eventTitle || "节点",
      text: point.text || "",
      level: point.level || "core",
      severity: 80,
      eventId: point.eventId || point.id
    };
    const pseudoEvent = { title: item.title, summary: item.text, level: "core" };
    if (isInternalConflictEvent(pseudoEvent, query) || /冲突|战争|和谈|停火/.test(`${item.title} ${item.text}`)) {
      mainPoints.push(item);
    } else {
      const dim = /金融|市场|利率|通胀|油价|航运成本|供应链/.test(`${item.title} ${item.text}`)
        ? "market"
        : /\bai\b|gpt|llm|大模型|算力|芯片/i.test(`${item.title} ${item.text}`)
          ? "technology"
          : "policy";
      const lane = impactLanes.find((l) => l.dimension === dim) || impactLanes[0];
      lane.points.push(item);
    }
  }

  const mainLane = {
    id: "main-lane",
    label: mainLabel,
    kind: "main",
    y: mainY,
    points: mapPointsWithX(mainPoints, mainY, timeScale, "internal")
  };
  for (const lane of impactLanes) {
    lane.points = mapPointsWithX(lane.points, lane.y, timeScale, "external");
  }
  return { mainLane, impactLanes };
}

export function buildEventLines(events, graphNodes, graphEdges, options = {}) {
  const endTs = options.endTs || Date.now();
  const query = String(options.query || "主事件");
  const { startTs, longConflict } = resolveAnalysisWindow(query, endTs);
  const timeScale = buildTimeAxisScale(startTs, endTs, { longConflict });

  const eventById = new Map();
  for (const event of events || []) {
    eventById.set(event.id, event);
  }
  for (const node of graphNodes || []) {
    if (!eventById.has(node.id)) eventById.set(node.id, node);
  }

  const sorted = [...(events || [])]
    .filter((event) => matchesAnalysisQuery(event, query))
    .sort((a, b) => {
      const boost = (event) =>
        isTechAiQuery(query) && /\bgpt\b|chatgpt|openai|anthropic|llm|大模型/i.test(techEventCorpus(event)) ? 12 : 0;
      const scoreA = Number(a.severity || 0) + boost(a);
      const scoreB = Number(b.severity || 0) + boost(b);
      return scoreB - scoreA || new Date(b.occurredAt) - new Date(a.occurredAt);
    })
    .slice(0, 24);

  let mainLane;
  let impactLanes;

  if (sorted.length >= 2) {
    const mainY = LANE_HEIGHT / 2;
    const mainPointsRaw = [];
    const impactBuckets = new Map(IMPACT_LANE_ORDER.map((spec) => [spec.dimension, []]));

    for (const event of sorted) {
      const rawPoints = collectLanePoints(event, startTs, endTs);
      if (!rawPoints.length) continue;
      const internal = isInternalConflictEvent(event, query);
      for (const point of rawPoints) {
        const enriched = { ...point, eventId: event.id };
        if (internal) {
          mainPointsRaw.push(enriched);
        } else {
          const dim = inferDimension(event);
          impactBuckets.get(dim)?.push(enriched);
        }
      }
    }

    const mainMerged = mergeMainMilestones(mainPointsRaw, options.chronology, query);

    if (mainMerged.length < 1 && options.chronology) {
      const structured = chronologyToStructured(options.chronology, query, timeScale);
      mainLane = structured.mainLane;
      impactLanes = structured.impactLanes;
    } else {
      mainLane = {
        id: "main-lane",
        label: query.slice(0, 24),
        kind: "main",
        y: mainY,
        points: mapPointsWithX(mainMerged, mainY, timeScale, "internal")
      };
      impactLanes = IMPACT_LANE_ORDER.map((spec, index) => {
        const y = LANE_HEIGHT * (index + 1) + LANE_HEIGHT / 2;
        return {
          id: `impact-${spec.dimension}`,
          dimension: spec.dimension,
          label: spec.label,
          kind: "impact",
          y,
          points: mapPointsWithX(impactBuckets.get(spec.dimension) || [], y, timeScale, "external")
        };
      });
    }
  } else if (options.chronology) {
    const structured = chronologyToStructured(options.chronology, query, timeScale);
    mainLane = structured.mainLane;
    impactLanes = structured.impactLanes;
  } else {
    mainLane = { id: "main-lane", label: query.slice(0, 24), kind: "main", y: LANE_HEIGHT / 2, points: [] };
    impactLanes = IMPACT_LANE_ORDER.map((spec, index) => ({
      id: `impact-${spec.dimension}`,
      dimension: spec.dimension,
      label: spec.label,
      kind: "impact",
      y: LANE_HEIGHT * (index + 1) + LANE_HEIGHT / 2,
      points: []
    }));
  }

  const lanes = [mainLane, ...impactLanes];
  const impactArrows = buildImpactArrows(mainLane, impactLanes, graphEdges, eventById, timeScale);

  const influences = dedupeInfluenceList(
    impactArrows.map((arrow) => ({
      id: arrow.id,
      from: mainLane.id,
      to: arrow.toLaneId,
      x1: arrow.x,
      y1: arrow.fromY,
      x2: arrow.x,
      y2: arrow.toY,
      label: arrow.labelFull || arrow.label,
      influence: arrow.labelFull || arrow.label,
      tone: arrow.tone,
      kind: "external"
    }))
  );

  const laneCount = lanes.length;
  const mapNodes = (graphNodes && graphNodes.length ? graphNodes : options.graphNodes) || sorted;
  const mapLayer = buildMapLayer(mapNodes, []);
  const dimensionLayers = DIMENSION_LAYER_SPECS.map((spec) => {
    const lane = impactLanes.find((l) => l.dimension === spec.dimension);
    const points = lane?.points || [];
    return {
      ...spec,
      laneId: lane?.id,
      pointCount: points.length,
      highlights: points.slice(0, 3).map((p) => ({ id: p.id, title: p.title, at: p.at }))
    };
  });
  const axisNarrative = options.chronology?.axisNarrative || null;
  const displayRange = axisNarrative?.eventStart && axisNarrative?.eventEnd
    ? { start: axisNarrative.eventStart, end: axisNarrative.eventEnd }
    : { start: new Date(startTs).toISOString(), end: new Date(endTs).toISOString() };

  return {
    query,
    timeRange: displayRange,
    axisNarrative,
    timeAxis: timeAxisMeta(timeScale),
    width: CHART_WIDTH,
    height: Math.max(LANE_HEIGHT * 2, laneCount * LANE_HEIGHT),
    laneHeight: LANE_HEIGHT,
    mainLane,
    impactLanes,
    impactArrows,
    mapLayer,
    dimensionLayers,
    lanes,
    influences,
    totalLanes: lanes.length,
    totalPoints: lanes.reduce((sum, lane) => sum + (lane.points?.length || 0), 0),
    totalInfluences: influences.length
  };
}
