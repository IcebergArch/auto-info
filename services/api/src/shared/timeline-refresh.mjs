/**
 * 时间线「截至上次更新」锚点（UC-001 / UC-006 共用）
 */

import { productClockLabel, productDateTimeLabel } from "./utils.mjs";

function formatUtcClock(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatRefreshClock(iso, { productTime = false } = {}) {
  return productTime ? productClockLabel(iso) : formatUtcClock(iso);
}

function formatUtcTimeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${String(iso).slice(0, 10)} ${hh}:${mm}`;
}

const DOMAIN_COPY = {
  daily: {
    empty: (end) => `本次刷新周期内（00:00 — ${end}）暂无新增事件。`,
    filled: (n) => `以下 ${n} 条为本次更新前已收录的当日事件。`
  },
  "tech-radar": {
    empty: (end) => `本次刷新周期内（00:00 — ${end}）暂无新增科技雷达条目。`,
    filled: (n) => `以下 ${n} 条为本次更新前已收录的当日条目。`
  }
};

/**
 * @param {object} opts
 * @param {string} opts.date YYYY-MM-DD
 * @param {string} opts.refreshedAt ISO
 * @param {number} [opts.itemCount]
 * @param {"daily"|"tech-radar"} [opts.domain]
 * @param {string} [opts.idPrefix]
 */
export function buildRefreshCutoffEntry({
  date,
  refreshedAt,
  itemCount = 0,
  domain = "daily",
  idPrefix = "timeline-refresh-cutoff"
}) {
  const at = refreshedAt || new Date().toISOString();
  const dateKey = date || at.slice(0, 10);
  const useProductTime = domain === "daily";
  const endClock = formatRefreshClock(at, { productTime: useProductTime });
  const copy = DOMAIN_COPY[domain] || DOMAIN_COPY.daily;
  const desc = itemCount > 0 ? copy.filled(itemCount) : copy.empty(endClock);
  return {
    id: `${idPrefix}-${dateKey}`,
    at,
    time: useProductTime ? productDateTimeLabel(at) : formatUtcTimeLabel(at),
    isRefreshCutoff: true,
    title: "上次更新",
    displayTitle: "上次更新",
    desc,
    lane: "system",
    laneTitle: "刷新"
  };
}
