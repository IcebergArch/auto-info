/**
 * 科技雷达 — 核心大厂 / 平台（博客、论文、官方发布）
 * SSOT：平台名单与打分规则；入库与月报充实均优先匹配条目。
 */

export const BIG_TECH_PLATFORMS = [
  { id: "google", label: "Google", re: /\bgoogle\b|deepmind|gemini|blog\.google|ai\.google/i, domains: /google\.com|blog\.google|deepmind\.com/i },
  { id: "openai", label: "OpenAI", re: /\bopenai\b|chatgpt|gpt-4|gpt-5/i, domains: /openai\.com/i },
  { id: "anthropic", label: "Anthropic", re: /\banthropic\b|\bclaude\b/i, domains: /anthropic\.com/i },
  { id: "x", label: "X", re: /\bxai\b|\bx\.com\b|twitter\.com/i, domains: /x\.com|twitter\.com|x\.ai/i },
  { id: "meta", label: "Meta", re: /\bmeta\b|facebook|llama\b/i, domains: /meta\.com|ai\.meta\.com/i },
  { id: "microsoft", label: "Microsoft", re: /\bmicrosoft\b|\bazure\b|copilot/i, domains: /microsoft\.com/i },
  { id: "apple", label: "Apple", re: /\bapple\b|apple intelligence/i, domains: /apple\.com/i },
  { id: "amazon", label: "Amazon", re: /\bamazon\b|\baws\b|bedrock/i, domains: /amazon\.com|aws\.amazon/i },
  { id: "nvidia", label: "NVIDIA", re: /\bnvidia\b|\bcuda\b/i, domains: /nvidia\.com/i }
];

const CONTENT_BLOG_RE =
  /blog\.|engineering\.|developers\.|newsroom|announcement|发布|官方博客|技术博客/i;
const CONTENT_PAPER_RE =
  /\barxiv\b|paper|preprint|论文|research\.google|openreview|proceedings|acl\b|neurips|icml/i;

export function detectContentKind(text = "", url = "") {
  const blob = `${text} ${url}`;
  if (CONTENT_PAPER_RE.test(blob)) return "paper";
  if (CONTENT_BLOG_RE.test(blob)) return "blog";
  return "update";
}

export function matchBigTechPlatform(text = "", url = "") {
  const blob = `${text} ${url}`;
  for (const platform of BIG_TECH_PLATFORMS) {
    if (platform.re.test(blob) || (url && platform.domains.test(url))) {
      return platform;
    }
  }
  return null;
}

/** 0–100：越高越应进入科技雷达近期 / 月报科技栏优先位 */
export function scoreBigTechFocus(event = {}) {
  const title = String(event.title || event.displayTitle || "");
  const summary = String(event.summary || event.desc || "");
  const url = String(event.url || eventSourceUrlFromEvent(event) || "");
  const text = `${title} ${summary}`;
  const platform = matchBigTechPlatform(text, url);
  if (!platform) return 0;

  let score = 52;
  const kind = detectContentKind(text, url);
  if (kind === "blog") score += 22;
  if (kind === "paper") score += 26;
  if (url && /^https?:\/\//i.test(url)) score += 12;
  if (platform.domains.test(url)) score += 10;
  if (Number(event.severity || 0) >= 70) score += 6;
  return Math.min(100, score);
}

function eventSourceUrlFromEvent(event) {
  const ref = (event.references || []).find((r) => r?.url);
  return ref?.url ? String(ref.url).trim() : "";
}

export function rankTechEvents(events = []) {
  return [...events].sort((a, b) => {
    const diff = scoreBigTechFocus(b) - scoreBigTechFocus(a);
    if (diff !== 0) return diff;
    return (
      Number(b.severity || 0) - Number(a.severity || 0) ||
      new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0)
    );
  });
}

/** 月报充实：保留高分条目；低分仅作兜底（至少保留原列表长度下限） */
export function focusTechEventsForRadar(events = [], { minKeep = 6 } = {}) {
  const ranked = rankTechEvents(events);
  const focused = ranked.filter((e) => scoreBigTechFocus(e) >= 40);
  if (focused.length >= minKeep) return focused;
  const seen = new Set(focused.map((e) => e.id));
  for (const event of ranked) {
    if (seen.has(event.id)) continue;
    focused.push(event);
    seen.add(event.id);
    if (focused.length >= minKeep) break;
  }
  return focused;
}

export function entryMatchesBigTechFocus(entry = {}) {
  const blob = `${entry.term} ${entry.title} ${entry.brief} ${(entry.tags || []).join(" ")} ${(entry.sources || []).map((s) => `${s.title} ${s.url}`).join(" ")}`;
  return Boolean(matchBigTechPlatform(blob)) || (entry.tags || []).includes("大厂");
}

export function prioritizeRadarEntries(entries = []) {
  const day = entries.filter((e) => e.granularity === "day");
  const other = entries.filter((e) => e.granularity !== "day");
  day.sort((a, b) => {
    const aFocus = entryMatchesBigTechFocus(a) ? 1 : 0;
    const bFocus = entryMatchesBigTechFocus(b) ? 1 : 0;
    if (bFocus !== aFocus) return bFocus - aFocus;
    return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
  });
  return [...day, ...other];
}
