import { useCallback, useEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from "react";
import { formatDateKeyMd } from "./tech-radar/techRadarFormat";
import { EventLineClusterDetails } from "./EventLineClusterDetails";
import { EventLinePoints } from "./EventLinePoints";
import { EventLinesTimeBrush } from "./EventLinesTimeBrush";
import {
  buildEventLinesTicks,
  buildEventLinesTimeScale,
  type EventLinesTimeAxisMeta
} from "./event-lines-time-scale";
import {
  buildPlotClusters,
  clusterIdMap,
  clusterXThresholdPx,
  isSameSelection,
  resolveClusterIds,
  type PlottedPoint
} from "./event-lines-cluster";

export type LinePoint = {
  id: string;
  at: string;
  title: string;
  text?: string;
  x: number;
  y: number;
  level?: string;
  kind?: "internal" | "external";
  eventId?: string;
  severity?: number;
};

type LineLane = {
  id: string;
  label: string;
  y: number;
  kind?: "main" | "impact";
  dimension?: string;
  points: LinePoint[];
};

type ImpactArrow = {
  id: string;
  x: number;
  fromY: number;
  toY: number;
  toLaneId?: string;
  label?: string;
  labelFull?: string;
  tone?: string;
  kind?: string;
};

type LineInfluence = {
  id: string;
  label?: string;
  tone?: string;
  influence?: string;
};

export type EventLinesPayload = {
  timeRange?: { start?: string; end?: string };
  axisNarrative?: {
    headline?: string;
    background?: string;
    leftCaption?: string;
    rightCaption?: string;
    outbreakCaption?: string;
    eventStart?: string | null;
    eventEnd?: string | null;
  };
  timeAxis?: EventLinesTimeAxisMeta;
  width?: number;
  height?: number;
  mainLane?: LineLane;
  impactLanes?: LineLane[];
  impactArrows?: ImpactArrow[];
  lanes?: LineLane[];
  influences?: LineInfluence[];
  mapLayer?: {
    regions?: Array<{
      id: string;
      label: string;
      cx?: number;
      cy?: number;
      eventCount: number;
      intensity: number;
    }>;
  };
  dimensionLayers?: Array<{
    dimension: string;
    label: string;
    depth: number;
    zOffset: number;
    pointCount?: number;
    highlights?: Array<{ id: string; title?: string; at?: string }>;
  }>;
};

type NodeHint = {
  id: string;
  title?: string;
  summary?: string;
  occurredAt?: string;
  severity?: number;
  category?: string;
  region?: string;
};

const RIGHT_READ_GUTTER = 48;
const MIN_VIEW_SPAN_MS = 14 * 86400000;

function levelRadius(level?: string) {
  if (level === "core") return 7;
  if (level === "important") return 5.5;
  return 4.5;
}

function toneClass(tone?: string) {
  if (tone === "negative") return "event-lines-arrow-negative";
  if (tone === "positive") return "event-lines-arrow-positive";
  return "event-lines-arrow-neutral";
}

function parseTs(iso?: string) {
  const t = new Date(iso || 0).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function EventLinesChart({
  data,
  nodes = [],
  onRefresh,
  refreshing = false
}: {
  data: EventLinesPayload;
  nodes?: NodeHint[];
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [viewRange, setViewRange] = useState<{ start: number; end: number } | null>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  const lanes = data.lanes || [];
  const mainLane = data.mainLane || lanes.find((lane) => lane.kind === "main") || lanes[0];
  const impactLanes = data.impactLanes || lanes.filter((lane) => lane.kind === "impact" || lane.id?.startsWith("impact-"));
  const impactArrows = data.impactArrows || [];
  const width = data.width || 1000;
  const plotWidth = width - RIGHT_READ_GUTTER;
  const height = data.height || Math.max(200, lanes.length * 64);
  const padding = { left: 108, right: 24, top: 32, bottom: 28 };
  const svgW = padding.left + width + padding.right;
  const svgH = padding.top + height + padding.bottom;

  const timeBounds = useMemo(() => {
    const stamps = lanes
      .flatMap((lane) => lane.points || [])
      .map((point) => parseTs(point.at))
      .filter(Number.isFinite);
    const narrativeStart = parseTs(data.timeRange?.start);
    const narrativeEnd = parseTs(data.timeRange?.end);
    if (Number.isFinite(narrativeStart)) stamps.push(narrativeStart);
    if (Number.isFinite(narrativeEnd)) stamps.push(narrativeEnd);
    if (!stamps.length) {
      const now = Date.now();
      return { min: now - 86400000 * 365 * 3, max: now };
    }
    return { min: Math.min(...stamps), max: Math.max(...stamps) };
  }, [data.timeRange?.end, data.timeRange?.start, lanes]);

  const chartResetKey = `${data.timeRange?.start || ""}|${data.timeRange?.end || ""}|${lanes.length}`;

  useEffect(() => {
    setViewRange(null);
    setSelectedPointIds([]);
  }, [chartResetKey]);

  const viewStart = viewRange?.start ?? timeBounds.min;
  const viewEnd = viewRange?.end ?? timeBounds.max;
  const viewSpan = Math.max(1, viewEnd - viewStart);
  const fullTimeScale = useMemo(
    () => buildEventLinesTimeScale(timeBounds.min, timeBounds.max, data.timeAxis),
    [data.timeAxis, timeBounds.max, timeBounds.min]
  );
  const visibleTimeScale = useMemo(
    () => buildEventLinesTimeScale(viewStart, viewEnd, data.timeAxis),
    [data.timeAxis, viewEnd, viewStart]
  );

  const timeToPlotX = useCallback(
    (atIso: string) => {
      const t = parseTs(atIso);
      if (!Number.isFinite(t)) return padding.left;
      const ratio = visibleTimeScale.toRatio(t);
      return padding.left + ratio * plotWidth;
    },
    [padding.left, plotWidth, visibleTimeScale]
  );

  const xToTs = useCallback(
    (chartX: number) => {
      const ratio = Math.max(0, Math.min(1, (chartX - padding.left) / plotWidth));
      return visibleTimeScale.fromRatio(ratio);
    },
    [padding.left, plotWidth, visibleTimeScale]
  );

  const arrowToPlotX = useCallback(
    (arrowX: number) => {
      const ts = fullTimeScale.fromRatio(arrowX / width);
      if (ts < viewStart || ts > viewEnd) return null;
      const ratio = visibleTimeScale.toRatio(ts);
      return padding.left + ratio * plotWidth;
    },
    [fullTimeScale, padding.left, plotWidth, viewEnd, viewStart, visibleTimeScale, width]
  );

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const pointIndex = useMemo(() => {
    const map = new Map<string, { point: LinePoint; laneLabel: string }>();
    for (const lane of lanes) {
      for (const point of lane.points || []) {
        map.set(point.id, { point, laneLabel: lane.label });
      }
    }
    return map;
  }, [lanes]);

  const selectedSet = useMemo(() => new Set(selectedPointIds), [selectedPointIds]);

  const plottedPoints = useMemo(() => {
    const items: PlottedPoint[] = [];
    for (const lane of lanes) {
      const isMain = lane.kind === "main" || lane.id === "main-lane";
      const baseY = padding.top + lane.y;
      for (const point of lane.points || []) {
        if (!isMain && point.kind !== "external") continue;
        const t = parseTs(point.at);
        if (!Number.isFinite(t) || t < viewStart || t > viewEnd) continue;
        items.push({
          id: point.id,
          cx: timeToPlotX(point.at),
          cy: baseY,
          laneId: lane.id,
          laneLabel: lane.label,
          point,
          isMain
        });
      }
    }
    return items;
  }, [lanes, padding.top, timeToPlotX, viewEnd, viewStart]);

  const clusterXThreshold = clusterXThresholdPx(viewSpan, plotWidth);
  const plotClusters = useMemo(
    () => buildPlotClusters(plottedPoints, clusterXThreshold),
    [plottedPoints, clusterXThreshold]
  );
  const clusterMap = useMemo(() => clusterIdMap(plotClusters), [plotClusters]);
  const clusterCountByPointId = useMemo(() => {
    const map = new Map<string, number>();
    for (const group of plotClusters) {
      for (const item of group) map.set(item.id, group.length);
    }
    return map;
  }, [plotClusters]);
  const clusterBadgePointId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of plotClusters) {
      if (group.length < 2) continue;
      const badge =
        group.find((item) => item.isMain) ||
        group.slice().sort((a, b) => b.cy - a.cy)[0];
      if (badge) map.set(badge.id, badge.id);
    }
    return map;
  }, [plotClusters]);

  const selectedItems = useMemo(() => {
    return selectedPointIds
      .map((id) => pointIndex.get(id))
      .filter((item): item is { point: LinePoint; laneLabel: string } => Boolean(item))
      .map((item) => ({
        point: item.point,
        laneLabel: item.laneLabel,
        nodeHint: item.point.eventId ? nodeById.get(item.point.eventId) : undefined
      }));
  }, [nodeById, pointIndex, selectedPointIds]);

  const narrative = data.axisNarrative;
  const axisStart = data.timeRange?.start?.slice(0, 10) || "";
  const axisEnd = data.timeRange?.end?.slice(0, 10) || "";
  const startLabel =
    narrative?.leftCaption ||
    (axisStart ? formatDateKeyMd(axisStart) : "");
  const endLabel =
    narrative?.rightCaption ||
    (axisEnd ? formatDateKeyMd(axisEnd) : "");
  const axisRangeLabel =
    startLabel && endLabel
      ? startLabel === endLabel
        ? startLabel
        : `${startLabel} — ${endLabel}`
      : "";
  const axisEndX = padding.left + plotWidth;

  const applyViewRange = (start: number, end: number) => {
    setViewRange({ start, end });
  };

  const resetView = () => setViewRange(null);

  const onChartWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const el = chartScrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left + el.scrollLeft) / Math.max(1, el.scrollWidth)));
    const chartX = padding.left + ratio * plotWidth;
    const center = xToTs(chartX);
    const centerRatio = fullTimeScale.toRatio(center);
    const rangeStartRatio = fullTimeScale.toRatio(viewStart);
    const rangeEndRatio = fullTimeScale.toRatio(viewEnd);
    const currentRatioSpan = Math.max(0.04, rangeEndRatio - rangeStartRatio);
    const factor = event.deltaY < 0 ? 0.82 : 1.22;
    const newRatioSpan = Math.max(0.04, Math.min(1, currentRatioSpan * factor));
    let startRatio = centerRatio - newRatioSpan * ratio;
    let endRatio = startRatio + newRatioSpan;
    if (startRatio < 0) {
      endRatio -= startRatio;
      startRatio = 0;
    }
    if (endRatio > 1) {
      startRatio -= endRatio - 1;
      endRatio = 1;
    }
    let start = fullTimeScale.fromRatio(startRatio);
    let end = fullTimeScale.fromRatio(endRatio);
    if (end - start < MIN_VIEW_SPAN_MS) {
      const mid = fullTimeScale.fromRatio((startRatio + endRatio) / 2);
      start = Math.max(timeBounds.min, mid - MIN_VIEW_SPAN_MS / 2);
      end = Math.min(timeBounds.max, mid + MIN_VIEW_SPAN_MS / 2);
    }
    applyViewRange(start, end);
  };

  const togglePoint = (pointId: string) => {
    const clusterIds = resolveClusterIds(pointId, clusterMap);
    setSelectedPointIds((current) => {
      if (isSameSelection(current, clusterIds)) return [];
      return clusterIds;
    });
  };

  const viewportTicks = useMemo(() => {
    return buildEventLinesTicks(visibleTimeScale, plotWidth).map((tick) => ({
      ...tick,
      x: padding.left + tick.x
    }));
  }, [padding.left, plotWidth, visibleTimeScale]);
  const breakpointX = visibleTimeScale.hasBreakpoint
    ? padding.left + visibleTimeScale.historyWidth * plotWidth
    : null;

  if (!lanes.length) {
    return <p className="result-text analysis-panel-empty">—</p>;
  }

  return (
    <div className="event-lines-wrap">
      <div className="event-lines-toolbar">
        <div className="event-lines-meta-block">
          {narrative?.headline ? <p className="event-lines-headline">{narrative.headline}</p> : null}
          {axisRangeLabel ? (
            <p className="event-lines-meta-row event-lines-axis-range">{axisRangeLabel}</p>
          ) : null}
        </div>
        {onRefresh ? (
          <button type="button" className="btn btn-secondary event-lines-refresh-btn" disabled={refreshing} onClick={onRefresh}>
            {refreshing ? "更新中…" : "更新事件"}
          </button>
        ) : null}
      </div>

      <EventLinesTimeBrush
        minTs={timeBounds.min}
        maxTs={timeBounds.max}
        viewStart={viewStart}
        viewEnd={viewEnd}
        timeScale={fullTimeScale}
        onChange={applyViewRange}
        onReset={resetView}
      />

      <div ref={chartScrollRef} className="event-lines-chart-scroll" onWheel={onChartWheel}>
        <svg
          className="event-lines-svg"
          viewBox={`0 0 ${svgW} ${svgH}`}
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label="事件脉络时间线图"
        >
          <defs>
            <marker id="arrowhead-neutral" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="event-lines-marker-neutral" />
            </marker>
            <marker id="arrowhead-negative" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="event-lines-marker-negative" />
            </marker>
            <marker id="arrowhead-positive" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" className="event-lines-marker-positive" />
            </marker>
          </defs>

          <text x={padding.left} y={18} className="event-lines-axis-label">
            {new Date(viewStart).toISOString().slice(0, 10)}
          </text>
          <text x={axisEndX} y={18} textAnchor="end" className="event-lines-axis-label">
            {new Date(viewEnd).toISOString().slice(0, 10)}
          </text>

          {viewportTicks.map((tick) => (
            <g key={`vp-tick-${tick.label}`} className="event-lines-year-tick">
              <line
                x1={tick.x}
                y1={padding.top + height}
                x2={tick.x}
                y2={padding.top + height + 4}
                className="event-lines-year-tick-line"
              />
              <text x={tick.x} y={padding.top + height + 16} textAnchor="middle" className="event-lines-year-tick-label">
                {tick.label}
              </text>
            </g>
          ))}

          {breakpointX != null ? (
            <g className="event-lines-breakpoint">
              <line
                x1={breakpointX}
                y1={padding.top - 14}
                x2={breakpointX}
                y2={padding.top + height + 4}
                className="event-lines-breakpoint-line"
              />
              <text x={breakpointX + 6} y={padding.top + height + 16} className="event-lines-breakpoint-label">
                {visibleTimeScale.breakpointLabel}
              </text>
            </g>
          ) : null}

          {impactArrows.map((arrow) => {
            const x1 = arrowToPlotX(arrow.x);
            if (x1 == null) return null;
            const y1 = padding.top + arrow.fromY;
            const x2 = x1 + 18;
            const y2 = padding.top + arrow.toY;
            const marker =
              arrow.tone === "negative"
                ? "url(#arrowhead-negative)"
                : arrow.tone === "positive"
                  ? "url(#arrowhead-positive)"
                  : "url(#arrowhead-neutral)";
            const tip = arrow.labelFull || arrow.label || "影响";
            return (
              <g key={arrow.id} className={`event-lines-impact ${toneClass(arrow.tone)}`}>
                <title>{tip}</title>
                <line x1={x1} y1={y1} x2={x2} y2={y2} className="event-lines-impact-line" markerEnd={marker} />
                <text x={x2 + 10} y={y2 + 4} textAnchor="start" className="event-lines-impact-label">
                  {arrow.label || "影响"}
                </text>
              </g>
            );
          })}

          {lanes.map((lane) => {
            const baseY = padding.top + lane.y;
            const isMain = lane.kind === "main" || lane.id === "main-lane";
            return (
              <g key={lane.id}>
                <text
                  x={padding.left - 10}
                  y={baseY + 4}
                  textAnchor="end"
                  className={`event-lines-lane-label${isMain ? " is-main" : ""}`}
                >
                  {isMain ? `主事件 · ${lane.label.length > 10 ? `${lane.label.slice(0, 10)}…` : lane.label}` : lane.label}
                </text>
                <line
                  x1={padding.left}
                  y1={baseY}
                  x2={axisEndX}
                  y2={baseY}
                  className={`event-lines-lane${isMain ? " is-main" : ""}`}
                />
                {(lane.points || [])
                  .filter((point) => isMain || point.kind === "external")
                  .map((point) => {
                    const t = parseTs(point.at);
                    if (!Number.isFinite(t) || t < viewStart || t > viewEnd) return null;
                    const cx = timeToPlotX(point.at);
                    const cy = baseY;
                    const isSelected = selectedSet.has(point.id);
                    const clusterSize = clusterCountByPointId.get(point.id) || 1;
                    const showBadge = clusterBadgePointId.has(point.id) && clusterSize > 1;
                    const hitR = isMain ? 14 : 12;
                    const clusterIds = clusterMap.get(point.id) || [point.id];
                    const clusterTitle = clusterIds
                      .map((id) => pointIndex.get(id)?.point.title)
                      .filter(Boolean)
                      .join("\n");
                    return (
                      <g key={point.id}>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={hitR}
                          className="event-lines-node-hit"
                          onClick={() => togglePoint(point.id)}
                          role="button"
                          tabIndex={0}
                          aria-label={
                            clusterSize > 1
                              ? `该时段 ${clusterSize} 个事件`
                              : `${point.title} ${point.at?.slice(0, 10) || ""}`
                          }
                          onKeyDown={(keyEvent) => {
                            if (keyEvent.key === "Enter" || keyEvent.key === " ") {
                              keyEvent.preventDefault();
                              togglePoint(point.id);
                            }
                          }}
                        />
                        {!isMain ? (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4}
                            className={`event-lines-node event-lines-node-context${isSelected ? " is-selected" : ""}`}
                            pointerEvents="none"
                          />
                        ) : null}
                        {isMain ? (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={levelRadius(point.level)}
                            className={`event-lines-node event-lines-node-${point.level || "core"} event-lines-node-internal${isSelected ? " is-selected" : ""}`}
                            pointerEvents="none"
                          />
                        ) : null}
                        {showBadge ? (
                          <g className="event-lines-cluster-badge" pointerEvents="none">
                            <circle cx={cx + 10} cy={cy - 10} r={9} className="event-lines-cluster-badge-bg" />
                            <text
                              x={cx + 10}
                              y={cy - 10}
                              textAnchor="middle"
                              dominantBaseline="central"
                              className="event-lines-cluster-badge-text"
                            >
                              {clusterSize}
                            </text>
                          </g>
                        ) : null}
                        <title>
                          {clusterSize > 1
                            ? `共 ${clusterSize} 个事件\n${clusterTitle}`
                            : `${point.title}\n${point.at?.slice(0, 10) || ""}\n${point.text || ""}`}
                        </title>
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>
      </div>

      {selectedItems.length ? (
        <EventLineClusterDetails
          items={selectedItems}
          focusPointId={selectedPointIds[0] || null}
        />
      ) : null}

      <EventLinePoints
        lanes={lanes}
        selectedPointIds={selectedPointIds}
        onSelect={togglePoint}
        nodeById={nodeById}
        viewStart={viewStart}
        viewEnd={viewEnd}
      />
    </div>
  );
}
