/** 分析时间轴：历史段压缩、近期段展开，便于关注近期变动细节 */

const MS_DAY = 86400000;
const MS_YEAR = 365.25 * 24 * 3600 * 1000;

const DEFAULT_HISTORY_WIDTH = 0.26;
const DEFAULT_RECENT_WIDTH = 0.74;
const LONG_CONFLICT_HISTORY_WIDTH = 0.48;
const LONG_CONFLICT_RECENT_WIDTH = 0.52;

export function buildTimeAxisScale(startTs, endTs, options = {}) {
  const end = Number(endTs);
  const start = Number(startTs);
  const span = Math.max(1, end - start);
  const spanYears = span / MS_YEAR;
  const y = Math.max(0.25, Math.min(5, spanYears));
  const longConflict = Boolean(options.longConflict) || spanYears > 3.5;
  const HISTORY_WIDTH = longConflict ? LONG_CONFLICT_HISTORY_WIDTH : DEFAULT_HISTORY_WIDTH;
  const RECENT_WIDTH = longConflict ? LONG_CONFLICT_RECENT_WIDTH : DEFAULT_RECENT_WIDTH;

  const recentMs = Math.min(
    MS_YEAR,
    Math.max(45 * MS_DAY, y * MS_YEAR * (longConflict ? 0.22 : 0.32))
  );
  const recentStartTs = Math.max(start, end - recentMs);
  const historySpan = Math.max(1, recentStartTs - start);

  function toRatio(ts) {
    const t = Math.max(start, Math.min(end, Number(ts)));
    if (t <= recentStartTs) {
      return ((t - start) / historySpan) * HISTORY_WIDTH;
    }
    return HISTORY_WIDTH + ((t - recentStartTs) / recentMs) * RECENT_WIDTH;
  }

  function toX(ts, chartWidth = 1000) {
    return Math.round(toRatio(ts) * chartWidth);
  }

  return {
    mode: longConflict ? "long-conflict-balanced" : "history-short-recent-long",
    longConflict,
    startTs: start,
    endTs: end,
    recentStartTs,
    recentMs,
    historyWidth: HISTORY_WIDTH,
    recentWidth: RECENT_WIDTH,
    toRatio,
    toX
  };
}

export function buildYearTicks(scale, chartWidth = 1000) {
  const startYear = new Date(scale.startTs).getUTCFullYear();
  const endYear = new Date(scale.endTs).getUTCFullYear();
  const ticks = [];
  for (let year = startYear; year <= endYear; year += 1) {
    const ts = Date.UTC(year, 0, 1);
    if (ts < scale.startTs - MS_DAY || ts > scale.endTs) continue;
    ticks.push({
      label: String(year),
      at: new Date(ts).toISOString(),
      ratio: scale.toRatio(ts),
      x: scale.toX(ts, chartWidth)
    });
  }
  return ticks;
}

export function timeAxisMeta(scale, chartWidth = 1000) {
  return {
    mode: scale.mode,
    historyWidth: scale.historyWidth,
    recentWidth: scale.recentWidth,
    recentStart: new Date(scale.recentStartTs).toISOString(),
    breakpointLabel: scale.longConflict ? "近期略展开" : "近期展开",
    ticks: buildYearTicks(scale, chartWidth)
  };
}
