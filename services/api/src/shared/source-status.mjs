const READY = "ready";
const NOT_FETCHED = "not_fetched";
const SOURCE_FAILED = "source_failed";
const FILTERED_EMPTY = "filtered_empty";

function normalizeProviderStatuses(sourceSearches = []) {
  return sourceSearches.flatMap((search) =>
    (Array.isArray(search?.providerStatuses) ? search.providerStatuses : []).map((status) => ({
      provider: String(status.provider || "unknown"),
      status: String(status.status || "unknown"),
      count: Number(status.count || 0),
      message: String(status.message || "")
    }))
  );
}

export function summarizeSourceSearches(sourceSearches = []) {
  const providerStatuses = normalizeProviderStatuses(sourceSearches);
  const articleCount = sourceSearches.reduce(
    (sum, search) => sum + Math.max(0, Number(search?.articleCount || 0)),
    0
  );
  return {
    attempted: sourceSearches.length > 0,
    articleCount,
    providerStatuses
  };
}

function statusMessage(kind, { articleCount, eventCount }) {
  if (kind === READY) {
    return eventCount > 0
      ? `已生成 ${eventCount} 条当日事件。`
      : "已有可展示内容。";
  }
  if (kind === SOURCE_FAILED) {
    return "已尝试拉取外部来源，但当前 provider 均未返回可用资料。";
  }
  if (kind === FILTERED_EMPTY) {
    return `已检索到 ${articleCount} 条资料，但未形成当日有效事件。`;
  }
  return "当前日期尚未执行外部来源刷新，仅按本地事件库生成。";
}

export function emptySourceStatus({ eventCount = 0 } = {}) {
  const kind = eventCount > 0 ? READY : NOT_FETCHED;
  return {
    kind,
    message: statusMessage(kind, { articleCount: 0, eventCount }),
    sourceAttempted: false,
    sourceArticleCount: 0,
    ingestedEventCount: Math.max(0, Number(eventCount || 0)),
    providerStatuses: []
  };
}

export function deriveSourceStatus({ eventCount = 0, sourceSearches = [] } = {}) {
  const ingestedEventCount = Math.max(0, Number(eventCount || 0));
  const { attempted, articleCount, providerStatuses } = summarizeSourceSearches(sourceSearches);
  let kind = NOT_FETCHED;

  if (ingestedEventCount > 0) {
    kind = READY;
  } else if (!attempted) {
    kind = NOT_FETCHED;
  } else if (articleCount > 0) {
    kind = FILTERED_EMPTY;
  } else {
    kind = SOURCE_FAILED;
  }

  return {
    kind,
    message: statusMessage(kind, { articleCount, eventCount: ingestedEventCount }),
    sourceAttempted: attempted,
    sourceArticleCount: articleCount,
    ingestedEventCount,
    providerStatuses
  };
}

export const SOURCE_STATUS_KINDS = [NOT_FETCHED, SOURCE_FAILED, FILTERED_EMPTY, READY];
