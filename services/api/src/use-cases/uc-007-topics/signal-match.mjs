import { readEventStore } from "../../shared/store.mjs";
import { matchesAnalysisQuery } from "../uc-002-event-analysis/match-query.mjs";

/**
 * 事件文本语料（标题+摘要+标签+类目+地区），小写化用于别名匹配。
 */
function eventCorpus(event) {
  return [
    event.title,
    event.summary,
    event.region,
    event.category,
    Array.isArray(event.tags) ? event.tags.join(" ") : ""
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * 安全的别名命中判定：直接对事件语料做匹配，不经过 uc-002 的 graphQueryTerms
 * 别名展开（后者存在 "ukraine" 含子串 "ai" 触发 ALIAS_MAP 误展开的既有缺陷）。
 * - 纯英文短词（<=3，如 ai/eu/us）走词边界，避免子串误命中。
 * - 其余走包含匹配。
 */
function aliasHitsEvent(corpus, alias) {
  const value = String(alias || "").toLowerCase().trim();
  if (value.length < 2) return false;
  if (/^[a-z][a-z0-9]*$/.test(value) && value.length <= 3) {
    return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(corpus);
  }
  return corpus.includes(value);
}

/**
 * 用议题的 query + aliases 匹配事件 store，返回命中的 event（按冲击降序）。
 * 主查询复用 uc-002 已验证的 matchesAnalysisQuery；别名走本地安全匹配，
 * 规避现有 match-query.graphQueryTerms 的别名误展开缺陷。
 */
export async function matchSignalsForTopic(topic, { limit = 60 } = {}) {
  const store = await readEventStore();
  const query = String(topic.query || topic.title || "").trim();
  const aliases = Array.isArray(topic.aliases) ? topic.aliases : [];

  const matched = store.events.filter((event) => {
    if (query && matchesAnalysisQuery(event, query)) return true;
    if (!aliases.length) return false;
    const corpus = eventCorpus(event);
    return aliases.some((alias) => aliasHitsEvent(corpus, alias));
  });

  matched.sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0));
  return matched.slice(0, limit);
}
