import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { EventLinesTimeScale } from "./event-lines-time-scale";

function formatBrushLabel(ts: number) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EventLinesTimeBrush({
  minTs,
  maxTs,
  viewStart,
  viewEnd,
  timeScale,
  onChange,
  onReset
}: {
  minTs: number;
  maxTs: number;
  viewStart: number;
  viewEnd: number;
  timeScale: EventLinesTimeScale;
  onChange: (start: number, end: number) => void;
  onReset: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const span = Math.max(1, maxTs - minTs);
  const minRatioSpan = 0.04;

  const toRatio = useCallback((ts: number) => timeScale.toRatio(ts), [timeScale]);
  const fromRatio = useCallback((ratio: number) => timeScale.fromRatio(ratio), [timeScale]);

  const applyRatioRange = useCallback(
    (startRatio: number, endRatio: number) => {
      let s = Math.max(0, Math.min(1, startRatio));
      let e = Math.max(0, Math.min(1, endRatio));
      if (e - s < minRatioSpan) {
        const mid = (s + e) / 2;
        s = mid - minRatioSpan / 2;
        e = mid + minRatioSpan / 2;
      }
      if (s < 0) {
        e -= s;
        s = 0;
      }
      if (e > 1) {
        s -= e - 1;
        e = 1;
      }
      onChange(fromRatio(s), fromRatio(e));
    },
    [fromRatio, onChange]
  );

  const onTrackPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const currentRatioSpan = Math.max(minRatioSpan, toRatio(viewEnd) - toRatio(viewStart));
    applyRatioRange(ratio - currentRatioSpan / 2, ratio + currentRatioSpan / 2);
  };

  const startDrag = (edge: "start" | "end" | "move") => (event: ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const originX = event.clientX;
    const originStartRatio = toRatio(viewStart);
    const originEndRatio = toRatio(viewEnd);

    const onMove = (moveEvent: PointerEvent) => {
      const deltaRatio = (moveEvent.clientX - originX) / rect.width;
      if (edge === "move") {
        applyRatioRange(originStartRatio + deltaRatio, originEndRatio + deltaRatio);
        return;
      }
      if (edge === "start") {
        applyRatioRange(originStartRatio + deltaRatio, originEndRatio);
        return;
      }
      applyRatioRange(originStartRatio, originEndRatio + deltaRatio);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const viewStartRatio = toRatio(viewStart);
  const viewEndRatio = toRatio(viewEnd);
  const left = `${(viewStartRatio * 100).toFixed(2)}%`;
  const width = `${((viewEndRatio - viewStartRatio) * 100).toFixed(2)}%`;
  const zoomed = viewStart > minTs + span * 0.01 || viewEnd < maxTs - span * 0.01;

  return (
    <div className="event-lines-brush-panel">
      <div className="event-lines-brush-head">
        <span className="event-lines-brush-label">
          时间区间 {formatBrushLabel(viewStart)} → {formatBrushLabel(viewEnd)}
          {zoomed ? "（已缩放）" : "（全览）"}
        </span>
        <div className="event-lines-brush-actions">
          <button type="button" className="btn btn-secondary btn-compact" onClick={onReset}>
            重置
          </button>
        </div>
      </div>
      <p className="result-text event-lines-brush-hint">拖拽选区平移 · 拖左右边缘缩放 · 在图表区滚轮缩放</p>
      <div
        ref={trackRef}
        className="event-lines-brush-track"
        role="slider"
        aria-label="脉络图时间区间"
        onPointerDown={onTrackPointer}
      >
        <div className="event-lines-brush-range" style={{ left, width }}>
          <button
            type="button"
            className="event-lines-brush-handle is-start"
            aria-label="区间起点"
            onPointerDown={startDrag("start")}
          />
          <button
            type="button"
            className="event-lines-brush-handle is-move"
            aria-label="平移区间"
            onPointerDown={startDrag("move")}
          />
          <button
            type="button"
            className="event-lines-brush-handle is-end"
            aria-label="区间终点"
            onPointerDown={startDrag("end")}
          />
        </div>
      </div>
      <div className="event-lines-brush-axis">
        <span>{formatBrushLabel(minTs)}</span>
        <span>{formatBrushLabel(maxTs)}</span>
      </div>
    </div>
  );
}
