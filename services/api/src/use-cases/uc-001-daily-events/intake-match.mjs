const STOP_TERMS = new Set([
  "搜索",
  "查询",
  "最新",
  "今日",
  "今天",
  "近期",
  "进展",
  "新闻",
  "动态",
  "快讯",
  "latest",
  "recent",
  "today",
  "news",
  "update"
]);

const TECH_QUERY = /\bai\b|人工智能|大模型|算力|芯片|llm|gpt|openai|anthropic|机器学习/i;
const GEO_CONFLICT =
  /ukraine|russia|俄乌|普京|泽连斯基|war in ukraine|gaza|nato|missile|ceasefire|顿巴斯|克里米亚/i;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function termInCorpus(corpus, term) {
  const value = String(term || "").toLowerCase().trim();
  if (!value) return false;
  if (value.length <= 3 && /^[a-z][a-z0-9]*$/i.test(value)) {
    return new RegExp(`\\b${escapeRegExp(value)}\\b`, "i").test(corpus);
  }
  return corpus.includes(value);
}

export function isTechAiQuery(query) {
  return TECH_QUERY.test(String(query || ""));
}

export function isGeoConflictCorpus(corpus) {
  const text = String(corpus || "");
  const geo = GEO_CONFLICT.test(text);
  const tech = TECH_QUERY.test(text);
  return geo && !tech;
}

export function intakeQueryTerms(query) {
  const raw = String(query || "").trim();
  const normalized = raw
    .toLowerCase()
    .replace(/最新|今日|今天|近期|进展|新闻|动态|快讯|latest|recent|today|news|update/gi, " ")
    .replace(/^\s*搜索\s*/i, "")
    .replace(/([a-z0-9]+)(?=[\u4e00-\u9fff])/gi, "$1 ")
    .replace(/([\u4e00-\u9fff])([a-z0-9]+)/gi, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  const terms = new Set();
  if (normalized.length >= 2) terms.add(normalized);

  for (const part of normalized.split(/[\s,，、/]+/).map((t) => t.trim()).filter(Boolean)) {
    if (STOP_TERMS.has(part)) continue;
    if (part.length >= 2 || /^[a-z0-9]+$/i.test(part)) terms.add(part);
  }

  const cn = normalized.match(/[\u4e00-\u9fff]{2,}/g) || [];
  for (const token of cn) {
    if (!STOP_TERMS.has(token)) terms.add(token);
  }

  const latin = normalized.match(/\b[a-z][a-z0-9]{1,}\b/gi) || [];
  for (const token of latin) {
    if (!STOP_TERMS.has(token.toLowerCase())) terms.add(token.toLowerCase());
  }

  return [...terms].filter((term) => term.length >= 2 || /^[a-z0-9]+$/i.test(term));
}

function eventCorpus(event, { includeTimeline = false } = {}) {
  const parts = [
    event.title,
    event.summary,
    event.category,
    event.region,
    ...(Array.isArray(event.tags) ? event.tags : [])
  ];
  if (includeTimeline) {
    for (const point of event.timeline || []) {
      if (point?.text) parts.push(point.text);
    }
    for (const ref of event.references || []) {
      if (ref?.title) parts.push(ref.title);
    }
  }
  return parts.join(" ").toLowerCase();
}

export function scoreIntakeEvent(event, query, terms, preferredCategory) {
  const corpus = eventCorpus(event, { includeTimeline: isTechAiQuery(query) });
  if (isTechAiQuery(query) && isGeoConflictCorpus(corpus)) return 0;

  let matched = 0;
  for (const term of terms) {
    if (termInCorpus(corpus, term)) matched += 1;
  }
  if (!matched) return 0;

  let score = matched;
  if (event.category === preferredCategory) score += 1.5;

  const significant = terms.filter((term) => !STOP_TERMS.has(term) && (term.length >= 3 || /[\u4e00-\u9fff]/.test(term)));
  if (significant.length >= 2 && matched < 2) {
    const hasPhrase = termInCorpus(corpus, significant.join("")) || termInCorpus(corpus, query.toLowerCase().replace(/\s*搜索\s*/i, "").trim());
    const hasAiKeyword =
      isTechAiQuery(query) && terms.some((term) => /^ai$/i.test(term) && termInCorpus(corpus, term));
    if (!hasPhrase && !hasAiKeyword) score *= 0.35;
  }

  return score;
}

export function matchesIntakeQuery(event, query) {
  const terms = intakeQueryTerms(query);
  if (!terms.length) return false;
  return scoreIntakeEvent(event, query, terms, inferCategoryFromQuery(query)) > 0;
}

export function inferCategoryFromQuery(query) {
  if (/AI|芯片|算力|半导体|模型|科技|大模型|人工智能/i.test(String(query || ""))) return "科技";
  if (/俄乌|乌克兰|俄罗斯|地缘|战争|制裁/i.test(String(query || ""))) return "地缘";
  return "未分类";
}

export function intakeMatchThreshold(terms, query = "") {
  const significant = terms.filter((term) => !STOP_TERMS.has(term));
  if (isTechAiQuery(query)) return 1;
  return Math.max(1, Math.min(significant.length, 2) * 0.75);
}
