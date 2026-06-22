import { readSystemConfigRaw } from "../uc-004-system-config/service.mjs";
import { nowIso, productDayUtcWindow } from "../../shared/utils.mjs";

const FRESHNESS_RE = /最新|今日|今天|近期|进展|新闻|动态|快讯|latest|recent|today|news|update/i;
const DEFAULT_TIMEOUT_MS = 4500;

export function hasFreshnessIntent(query) {
  return FRESHNESS_RE.test(String(query || ""));
}

// 口语/指令噪声词：检索前剥离，让核心实体浮现（"介绍下珀乐互动这家公司" → "珀乐互动"）
const QUERY_NOISE_RE = /(请?(帮我)?(介绍|分析|了解|查询|查一下|看看|说说|讲讲|科普)(一?下)?)|(这家|这个|那家|那个)(公司|企业|股票|标的|政策|事件|市场|行业)?|怎么样|如何|是什么|的情况|的现状|相关(情况|信息|资料)?/g;

function cleanLatestQuery(query) {
  let cleaned = String(query || "")
    .replace(FRESHNESS_RE, " ")
    .replace(QUERY_NOISE_RE, " ")
    .replace(/[？?。！!，,、]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // 噪声剥离后为空则回退到去 freshness 的原串，避免把整个查询清空
  if (!cleaned) {
    cleaned = String(query || "").replace(FRESHNESS_RE, " ").replace(/\s+/g, " ").trim();
  }
  if (/^ai$/i.test(cleaned) || /^人工智能$/.test(cleaned)) {
    return '("artificial intelligence" OR AI OR OpenAI OR Anthropic OR "Google AI")';
  }
  return cleaned || String(query || "").trim();
}

function dateWindow(dateKey) {
  const match = String(dateKey || "").match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return null;
  return productDayUtcWindow(dateKey);
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (/^\d{14}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}.000Z`;
  }
  if (/^\d{8}T\d{6}Z?$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}.000Z`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? nowIso() : date.toISOString();
}

function dedupeArticles(articles) {
  const seen = new Set();
  return articles.filter((article) => {
    const key = `${article.url || ""}|${article.title || ""}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(article.title);
  });
}

async function fetchJsonWithTimeout(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || payload.error || `HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, options = {}) {
  const { timeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function status(provider, next) {
  return {
    provider,
    status: next.status,
    count: next.count || 0,
    message: next.message || ""
  };
}

function decodeXml(value) {
  return String(value || "")
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function xmlTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseRssItems(xml, limit) {
  const blocks = String(xml || "").match(/<item[\s\S]*?<\/item>/gi) || [];
  return blocks.slice(0, limit).map((block) => ({
    title: xmlTag(block, "title"),
    url: xmlTag(block, "link"),
    source: xmlTag(block, "source") || "Google News",
    summary: xmlTag(block, "description").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    publishedAt: normalizeDate(xmlTag(block, "pubDate")),
    provider: "googleNews"
  }));
}

async function searchGoogle(query, google, limit, dateKey) {
  if (!google?.enabled) return { articles: [], status: status("google", { status: "skipped", message: "Google Search 未启用（仍可使用 Google News/GDELT 免费通道）" }) };
  if (!google.apiKey || !google.cx) {
    return { articles: [], status: status("google", { status: "free", message: "Google Search 缺少 apiKey/cx，已使用免费通道" }) };
  }

  const window = dateWindow(dateKey);
  const params = new URLSearchParams({
    key: google.apiKey,
    cx: google.cx,
    q: window ? `${query} after:${window.searchFrom} before:${window.searchTo}` : query,
    num: String(Math.max(1, Math.min(10, limit)))
  });
  if (!window) params.set("dateRestrict", "d7");
  const payload = await fetchJsonWithTimeout(`${google.endpoint || "https://www.googleapis.com/customsearch/v1"}?${params}`);
  const articles = (payload.items || []).map((item) => {
    const meta = item.pagemap?.metatags?.[0] || {};
    return {
      title: item.title,
      url: item.link,
      source: item.displayLink || "Google Search",
      summary: item.snippet || "",
      publishedAt: normalizeDate(meta["article:published_time"] || meta.date || meta.datepublished || meta.pubdate),
      provider: "google"
    };
  });
  return { articles, status: status("google", { status: "ok", count: articles.length, message: "Google Search 已返回结果" }) };
}

async function searchGoogleNews(query, limit, dateKey) {
  const window = dateWindow(dateKey);
  const params = new URLSearchParams({
    q: window ? `${cleanLatestQuery(query)} after:${window.searchFrom} before:${window.searchTo}` : `${cleanLatestQuery(query)} when:7d`,
    hl: "zh-CN",
    gl: "US",
    ceid: "US:zh-Hans"
  });
  const xml = await fetchTextWithTimeout(`https://news.google.com/rss/search?${params}`, { timeoutMs: 7000 });
  const articles = parseRssItems(xml, limit);
  return {
    articles,
    status: status("googleNews", { status: "ok", count: articles.length, message: "Google News RSS 已返回结果" })
  };
}

async function searchBrave(query, brave, limit, dateKey) {
  if (!brave?.enabled) {
    return { articles: [], status: status("brave", { status: "missing", message: "Brave Search 未启用" }) };
  }
  if (!brave.apiKey) {
    return { articles: [], status: status("brave", { status: "missing", message: "Brave Search 缺少 API Key" }) };
  }
  const window = dateWindow(dateKey);
  const params = new URLSearchParams({
    q: window ? `${cleanLatestQuery(query)} after:${window.from} before:${window.to}` : cleanLatestQuery(query),
    count: String(Math.max(1, Math.min(20, limit * 2)))
  });
  const payload = await fetchJsonWithTimeout(`${brave.endpoint || "https://api.search.brave.com/res/v1/web/search"}?${params}`, {
    headers: {
      "Accept": "application/json",
      "X-Subscription-Token": brave.apiKey
    }
  });
  const articles = (payload.web?.results || []).slice(0, limit).map((item) => ({
    title: item.title || "",
    url: item.url || "",
    source: item.profile?.name || "Brave Search",
    summary: item.description || "",
    publishedAt: normalizeDate(item.age || item.page_age || item.date || nowIso()),
    provider: "brave"
  }));
  return { articles, status: status("brave", { status: "configured", count: articles.length, message: "Brave Search 已返回结果" }) };
}

async function searchGdelt(query, limit, dateKey) {
  const window = dateWindow(dateKey);
  const params = new URLSearchParams({
    query: cleanLatestQuery(query),
    mode: "artlist",
    format: "json",
    sort: "datedesc",
    maxrecords: String(Math.max(1, Math.min(50, limit)))
  });
  if (window) {
    params.set("startdatetime", window.startDateTime);
    params.set("enddatetime", window.endDateTime);
  } else {
    params.set("timespan", "3d");
  }
  const payload = await fetchJsonWithTimeout(`https://api.gdeltproject.org/api/v2/doc/doc?${params}`);
  const articles = (payload.articles || []).map((item) => ({
    title: item.title,
    url: item.url,
    source: item.domain || item.sourcecountry || "GDELT",
    summary: item.snippet || item.context || "",
    publishedAt: normalizeDate(item.seendate || item.datetime || item.publishedAt),
    provider: "gdelt",
    language: item.language || "",
    region: item.sourcecountry || "全球"
  }));
  return { articles, status: status("gdelt", { status: "ok", count: articles.length, message: "公开新闻检索已返回结果" }) };
}

async function searchTwitter(query, twitter, limit) {
  if (!twitter?.enabled) return { articles: [], status: status("twitter", { status: "skipped", message: "Twitter/X Search 未启用" }) };

  const searchTwitterFree = async () => {
    const instances = [
      "https://nitter.net",
      "https://nitter.poast.org",
      "https://nitter.privacydev.net"
    ];
    const encoded = encodeURIComponent(cleanLatestQuery(query));
    for (const base of instances) {
      try {
        const url = `${base}/search/rss?f=tweets&q=${encoded}`;
        const xml = await fetchTextWithTimeout(url, { timeoutMs: 7000, headers: { "User-Agent": "Mozilla/5.0 Nexus-Auto-Intel" } });
        const articles = parseRssItems(xml, limit).map((item) => ({
          ...item,
          source: item.source || "Nitter",
          provider: "twitter-free",
          publishedAt: normalizeDate(item.publishedAt)
        }));
        return {
          articles,
          status: status("twitter", { status: "free", count: articles.length, message: "Twitter/X 已通过 Nitter 免费通道返回结果" })
        };
      } catch {
        // try next instance
      }
    }
    return {
      articles: [],
      status: status("twitter", { status: "error", message: "Twitter/X 免费通道不可用（Nitter 实例均失败）" })
    };
  };

  if (!twitter.bearerToken) return searchTwitterFree();

  const params = new URLSearchParams({
    query,
    max_results: String(Math.max(10, Math.min(100, limit * 2))),
    "tweet.fields": "created_at,public_metrics"
  });
  const payload = await fetchJsonWithTimeout(`${twitter.endpoint || "https://api.x.com/2/tweets/search/recent"}?${params}`, {
    headers: { Authorization: `Bearer ${twitter.bearerToken}` }
  });
  const articles = (payload.data || []).slice(0, limit).map((tweet) => ({
    title: tweet.text?.slice(0, 120) || "Twitter/X update",
    url: `https://x.com/i/web/status/${tweet.id}`,
    source: "Twitter/X",
    summary: tweet.text || "",
    publishedAt: normalizeDate(tweet.created_at),
    provider: "twitter"
  }));
  return { articles, status: status("twitter", { status: "ok", count: articles.length, message: "Twitter/X Search 已返回结果" }) };
}

async function safeProvider(provider, fn) {
  try {
    return await fn();
  } catch (error) {
    return {
      articles: [],
      status: status(provider, {
        status: "error",
        message: error.name === "AbortError" ? "检索超时" : error.message
      })
    };
  }
}

export async function searchLatestNews(query, { limit = 6, date = "" } = {}) {
  const config = await readSystemConfigRaw().catch(() => ({}));
  const sources = config.sources || {};
  const [google, brave, googleNews, gdelt, twitter] = await Promise.all([
    safeProvider("google", () => searchGoogle(query, sources.googleSearch, limit, date)),
    safeProvider("brave", () => searchBrave(query, sources.braveSearch, limit, date)),
    safeProvider("googleNews", () => searchGoogleNews(query, limit, date)),
    safeProvider("gdelt", () => searchGdelt(query, limit, date)),
    safeProvider("twitter", () => searchTwitter(query, sources.twitterSearch, limit))
  ]);

  const articles = dedupeArticles([
    ...google.articles,
    ...brave.articles,
    ...googleNews.articles,
    ...gdelt.articles,
    ...twitter.articles
  ])
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, limit);

  return {
    attempted: true,
    searchedAt: nowIso(),
    query,
    date: date || null,
    providerStatuses: [google.status, brave.status, googleNews.status, gdelt.status, twitter.status],
    articles
  };
}
