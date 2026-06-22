const MS_DAY = 86400000;
const MS_YEAR = 365.25 * MS_DAY;

const DEFAULT_HISTORY_WIDTH = 0.26;
const DEFAULT_RECENT_WIDTH = 0.74;
const LONG_CONFLICT_HISTORY_WIDTH = 0.48;
const LONG_CONFLICT_RECENT_WIDTH = 0.52;

export type EventLinesTimeAxisMeta = {
  mode?: string;
  historyWidth?: number;
  recentWidth?: number;
  recentStart?: string;
  breakpointLabel?: string;
  ticks?: Array<{ label?: string; at?: string; x?: number; ratio?: number }>;
};

export type EventLinesTimeScale = {
  mode: string;
  startTs: number;
  endTs: number;
  recentStartTs: number;
  historyWidth: number;
  recentWidth: number;
  hasBreakpoint: boolean;
  breakpointLabel: string;
  toRatio: (ts: number) => number;
  fromRatio: (ratio: number) => number;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function parseTs(value?: string) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : NaN;
}

function normalizeWidths(historyWidth?: number, recentWidth?: number, longConflict = false) {
  const fallbackHistory = longConflict ? LONG_CONFLICT_HISTORY_WIDTH : DEFAULT_HISTORY_WIDTH;
  const fallbackRecent = longConflict ? LONG_CONFLICT_RECENT_WIDTH : DEFAULT_RECENT_WIDTH;
  const history = Number.isFinite(historyWidth) && Number(historyWidth) > 0 ? Number(historyWidth) : fallbackHistory;
  const recent = Number.isFinite(recentWidth) && Number(recentWidth) > 0 ? Number(recentWidth) : fallbackRecent;
  const total = history + recent;
  if (!Number.isFinite(total) || total <= 0) {
    return { historyWidth: fallbackHistory, recentWidth: fallbackRecent };
  }
  return {
    historyWidth: history / total,
    recentWidth: recent / total
  };
}

function fallbackRecentStart(startTs: number, endTs: number, longConflict: boolean) {
  const span = Math.max(1, endTs - startTs);
  const spanYears = span / MS_YEAR;
  const y = Math.max(0.25, Math.min(5, spanYears));
  const recentMs = Math.min(
    MS_YEAR,
    Math.max(45 * MS_DAY, y * MS_YEAR * (longConflict ? 0.22 : 0.32))
  );
  return Math.max(startTs, endTs - recentMs);
}

export function buildEventLinesTimeScale(
  startTs: number,
  endTs: number,
  meta?: EventLinesTimeAxisMeta
): EventLinesTimeScale {
  const start = Number(startTs);
  const end = Math.max(start + 1, Number(endTs));
  const span = Math.max(1, end - start);
  const longConflict = meta?.mode === "long-conflict-balanced" || span / MS_YEAR > 3.5;
  const mode = meta?.mode || (longConflict ? "long-conflict-balanced" : "history-short-recent-long");
  const { historyWidth, recentWidth } = normalizeWidths(meta?.historyWidth, meta?.recentWidth, longConflict);
  const metaRecentStart = parseTs(meta?.recentStart);
  const recentStart = Number.isFinite(metaRecentStart)
    ? metaRecentStart
    : fallbackRecentStart(start, end, longConflict);
  const recentStartTs = Math.max(start, Math.min(end, recentStart));
  const hasBreakpoint =
    recentStartTs > start + MS_DAY &&
    recentStartTs < end - MS_DAY &&
    historyWidth > 0.05 &&
    recentWidth > 0.05;
  const historySpan = Math.max(1, recentStartTs - start);
  const recentSpan = Math.max(1, end - recentStartTs);

  const toRatio = (ts: number) => {
    const t = Math.max(start, Math.min(end, Number(ts)));
    if (!hasBreakpoint) return (t - start) / span;
    if (t <= recentStartTs) {
      return ((t - start) / historySpan) * historyWidth;
    }
    return historyWidth + ((t - recentStartTs) / recentSpan) * recentWidth;
  };

  const fromRatio = (ratio: number) => {
    const r = clamp01(ratio);
    if (!hasBreakpoint) return start + r * span;
    if (r <= historyWidth) {
      return start + (r / historyWidth) * historySpan;
    }
    return recentStartTs + ((r - historyWidth) / recentWidth) * recentSpan;
  };

  return {
    mode,
    startTs: start,
    endTs: end,
    recentStartTs,
    historyWidth,
    recentWidth,
    hasBreakpoint,
    breakpointLabel: meta?.breakpointLabel || (longConflict ? "近期略展开" : "近期展开"),
    toRatio,
    fromRatio
  };
}

export function buildEventLinesTicks(scale: EventLinesTimeScale, plotWidthPx: number) {
  const startYear = new Date(scale.startTs).getUTCFullYear();
  const endYear = new Date(scale.endTs).getUTCFullYear();
  const minGapPx = Math.max(44, Math.min(72, plotWidthPx * 0.065));
  const ticks: Array<{ label: string; x: number; ts: number }> = [];
  let lastX = -Infinity;

  for (let year = startYear; year <= endYear; year += 1) {
    const ts = Date.UTC(year, 0, 1);
    if (ts < scale.startTs - MS_DAY || ts > scale.endTs) continue;
    const x = scale.toRatio(ts) * plotWidthPx;
    const inRecent = scale.hasBreakpoint && ts >= scale.recentStartTs;
    const gap = inRecent ? minGapPx * 0.75 : minGapPx;
    if (x - lastX < gap && year !== endYear) continue;
    ticks.push({ label: String(year), x, ts });
    lastX = x;
  }

  return ticks;
}
