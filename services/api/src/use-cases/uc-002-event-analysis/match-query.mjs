import {
  intakeMatchThreshold,
  intakeQueryTerms,
  isGeoConflictCorpus,
  isTechAiQuery as intakeIsTechAiQuery,
  scoreIntakeEvent,
  inferCategoryFromQuery
} from "../uc-001-daily-events/intake-match.mjs";

const ALIAS_MAP = new Map([
  ["俄乌冲突", ["俄乌", "乌克兰", "俄罗斯", "乌东", "顿巴斯", "克里米亚", "制裁", "军援", "和谈", "停火"]],
  ["俄乌", ["乌克兰", "俄罗斯", "乌东", "顿巴斯", "克里米亚", "制裁", "军援"]],
  ["中东局势", ["中东", "红海", "冲突", "地缘", "航运"]],
  ["台海", ["台湾", "两岸", "地缘", "军事"]],
  ["关税", ["贸易", "出口", "制裁", "供应链"]],
  ["ai技术", ["人工智能", "artificial intelligence", "machine learning", "大模型", "算力", "芯片", "llm", "gpt", "chatgpt", "openai"]],
  ["ai", ["人工智能", "artificial intelligence", "machine learning", "大模型", "算力", "芯片", "gpt", "openai"]],
  ["gpt", ["openai", "chatgpt", "大模型", "llm", "anthropic"]]
]);

export function graphQueryTerms(query) {
  const normalized = String(query || "").toLowerCase().trim();
  const rawTerms = normalized
    .split(/[\s,，、/]+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const cnTerms = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const biGrams = [];
  for (const token of cnTerms) {
    if (token.length <= 2) {
      biGrams.push(token);
      continue;
    }
    for (let i = 0; i < token.length - 1; i += 1) {
      biGrams.push(token.slice(i, i + 2));
    }
  }
  const aliasTerms = [];
  for (const [key, values] of ALIAS_MAP.entries()) {
    if (normalized.includes(key)) aliasTerms.push(...values);
  }
  return Array.from(new Set([normalized, ...rawTerms, ...biGrams, ...aliasTerms])).filter((term) => term.length >= 2);
}

function eventCorpus(event, { includeTags = true, includeCategory = true } = {}) {
  const parts = [event.title, event.summary, event.region];
  if (includeCategory) parts.push(event.category);
  if (includeTags) parts.push((event.tags || []).join(" "));
  return parts.join(" ").toLowerCase();
}

function termInCorpus(corpus, term) {
  const value = String(term || "").toLowerCase().trim();
  if (!value) return false;
  if (value.length <= 3 && /^[a-z][a-z0-9]*$/i.test(value)) {
    return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(corpus);
  }
  return corpus.includes(value);
}

const TECH_QUERY = /\bai\b|人工智能|大模型|算力|芯片|llm|gpt|openai|anthropic|机器学习/i;
const GEO_CONFLICT =
  /ukraine|russia|俄乌|普京|泽连斯基|war in ukraine|gaza|nato|missile|ceasefire|顿巴斯|克里米亚/i;

export function isTechAiQuery(query) {
  return intakeIsTechAiQuery(query) || TECH_QUERY.test(String(query || ""));
}

export function isGeoConflictEvent(event) {
  const corpus = eventCorpus(event, { includeTags: false, includeCategory: false });
  return isGeoConflictCorpus(corpus) || (GEO_CONFLICT.test(corpus) && !TECH_QUERY.test(corpus));
}

export function matchesQuery(event, query) {
  const terms = graphQueryTerms(query);
  if (!terms.length) return false;
  const haystack = eventCorpus(event);
  return terms.some((term) => termInCorpus(haystack, term));
}

/** 分析/脉络图：主题相关度更严，禁止仅靠类目/标签「地缘」误入 */
export function matchesAnalysisQuery(event, query) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (isTechAiQuery(q) && isGeoConflictEvent(event)) return false;
  if (isTechAiQuery(q)) {
    const terms = intakeQueryTerms(q);
    const category = inferCategoryFromQuery(q);
    return scoreIntakeEvent(event, q, terms, category) >= intakeMatchThreshold(terms, q);
  }
  if (!isRussiaUkraineQuery(q)) {
    return matchesQuery(event, q);
  }

  const titleSummary = eventCorpus(event, { includeTags: false, includeCategory: false });
  const ruStrong =
    /俄乌|乌克兰|俄罗斯|乌东|顿巴斯|克里米亚|普京|泽连斯基|zelensky|putin|ukraine|russia|nato.*乌|军援.*乌|制裁.*俄|俄.*制裁|war.*ukraine|ukraine.*war|gripen|missile|ceasefire|frontline|donbas|crimea/i.test(
      titleSummary
    );
  if (ruStrong) return true;

  const offTopicUkOnly =
    /comrade keir|uk energy|british energy|starmer|keir\s+starmer/i.test(titleSummary)
    && !/ukraine|russia|俄|乌东|制裁.*莫斯科|moscow/i.test(titleSummary);
  if (offTopicUkOnly) return false;

  return false;
}

export function isRussiaUkraineQuery(query) {
  return /俄乌|乌克兰|俄罗斯|乌东|顿巴斯|ukraine|russia/i.test(String(query || ""));
}
