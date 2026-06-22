/** 分析时间窗：按主题自动推断，不暴露「回溯年数」参数 */

const MS_YEAR = 365.25 * 24 * 3600 * 1000;

/** 默认分析跨度（年） */
export const ANALYSIS_SPAN_YEARS = 3;

const LONG_CONFLICT_START_ISO = "2014-02-01T00:00:00.000Z";

export function isLongConflictQuery(query) {
  return /俄乌|乌克兰|俄罗斯|乌东|顿巴斯/.test(String(query || ""));
}

/**
 * @param {string} query
 * @param {number} [endTs]
 * @returns {{ startTs: number, endTs: number, longConflict: boolean, spanYears: number }}
 */
export function resolveAnalysisWindow(query, endTs = Date.now()) {
  const end = Number(endTs);
  const longConflict = isLongConflictQuery(query);
  let startTs = end - ANALYSIS_SPAN_YEARS * MS_YEAR;
  if (longConflict) {
    startTs = Math.min(startTs, new Date(LONG_CONFLICT_START_ISO).getTime());
  }
  return {
    startTs,
    endTs: end,
    longConflict,
    spanYears: ANALYSIS_SPAN_YEARS
  };
}

export function windowSinceDays(query, endTs = Date.now()) {
  const { startTs, endTs: end } = resolveAnalysisWindow(query, endTs);
  return Math.max(90, Math.ceil((end - startTs) / 86400000));
}
