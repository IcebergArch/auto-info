import {
  capReportDateKey,
  addDateKeyDays,
  dedupeByAt,
  inDateRange,
  nowIso,
  productDateKey,
  reportDisplayTitle,
  safeSlug,
  todayProductKey
} from "../../shared/utils.mjs";
import { fillTimelinePoints, normalizeEvent, toPublicEvent } from "../../shared/event-model.mjs";
import { mutateReportStore, readEventStore, readReportStore, writeEventStore } from "../../shared/store.mjs";
import { deriveSourceStatus, emptySourceStatus } from "../../shared/source-status.mjs";
import { searchLatestNews } from "./news-sources.mjs";
import {
  isTemplateFluff,
  isOverviewJunkLine,
  overviewFactFromEvent,
  presentEventForReport,
  stripLeadingLabel
} from "./event-display.mjs";
import { getRefreshIntervalHours } from "../../shared/product-config.mjs";
import {
  attachTodayTimeline,
  compressTimelineToArchived,
  shouldUseTimelinePresentation
} from "./daily-report-presentation.mjs";

const MAX_BACKFILL_DAYS = 31;

const REPORT_TOPIC_QUERIES = [
  { title: "政治", category: "政治", query: "global politics policy geopolitics latest" },
  { title: "金融", category: "金融", query: "global finance markets economy latest" },
  {
    title: "科技",
    category: "科技",
    query:
      "Google OpenAI Anthropic X AI blog paper Gemini Claude GPT arxiv Microsoft Meta NVIDIA AWS latest"
  }
];

const REPORT_SECTION_DEFS = [
  { key: "politics", title: "政治" },
  { key: "finance", title: "金融" },
  { key: "technology", title: "科技" },
  { key: "other", title: "其他" }
];

/** 日报正文四块（互斥归并） */
/** 概要总览三栏（不含国内） */
const OVERVIEW_PANEL_DEFS = [
  { key: "international", title: "国际局势" },
  { key: "technology", title: "科技" },
  { key: "finance", title: "金融" }
];

const REPORT_BLOCK_DEFS = [
  { key: "international", title: "国际局势" },
  { key: "technology", title: "科技" },
  { key: "finance", title: "金融" },
  {
    key: "domestic",
    title: "国内",
    description: "医疗、旅行、民生、媒体热点与中国本土关注"
  },
  { key: "other", title: "其他" }
];

const DEFAULT_FOCUS_CATEGORIES = ["国际局势", "中国政策", "AI", "音视频"];

function isMajorEvent(event) {
  return event.special || event.tags.some((tag) => tag === "重大");
}

function isTodayEvent(event) {
  const key = todayProductKey();
  return productDateKey(event.occurredAt) === key;
}

/** 日报事件：仅纳入 occurredAt 与报告 date 在产品时区同日的条目 */
function resolveReportEvents(store, date) {
  const events = Array.isArray(store.events) ? store.events : [];
  const reportEvents = events
    .filter((event) => productDateKey(event.occurredAt) === date)
    .slice()
    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0) || new Date(b.occurredAt) - new Date(a.occurredAt));

  return { reportEvents, eventWindow: { from: date, to: date } };
}

function reportDateFrom(searchParams) {
  const raw = searchParams.get("date");
  if (!raw) return todayProductKey();
  const match = String(raw).match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? raw : todayProductKey();
}

function reportModeFrom(searchParams) {
  const mode = String(searchParams.get("reportMode") || "v2").trim();
  return ["v1", "v2", "v3"].includes(mode) ? mode : "v2";
}

function reportDateValue(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}$/);
  return match ? value : todayProductKey();
}

function parseReportDate(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(dateKey, days) {
  const date = parseReportDate(dateKey);
  if (!date) return todayProductKey();
  return addDateKeyDays(dateKey, days);
}

function reportRangeValues(fromValue, toValue) {
  const from = parseReportDate(fromValue);
  const to = parseReportDate(toValue);
  if (!from || !to) {
    return { error: "请提供有效的 from 和 to，且 from <= to" };
  }
  const fromKey = from.toISOString().slice(0, 10);
  const toKey = capReportDateKey(to.toISOString().slice(0, 10));
  const toCapped = parseReportDate(toKey);
  if (!toCapped || from > toCapped) {
    return { error: "日期范围无效：起始日晚于今日或超过当前可归档日期" };
  }
  const days = Math.round((toCapped.getTime() - from.getTime()) / (24 * 3600 * 1000)) + 1;
  if (days > MAX_BACKFILL_DAYS) {
    return { error: `单次回溯最多支持 ${MAX_BACKFILL_DAYS} 天` };
  }
  return {
    from: fromKey,
    to: toKey,
    month: fromKey.slice(0, 7),
    dates: Array.from({ length: days }, (_, index) => new Date(from.getTime() + index * 24 * 3600 * 1000).toISOString().slice(0, 10))
  };
}

export function reportRangeFromMonth(monthValue) {
  const match = String(monthValue || "").trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    return { error: "请提供有效的 month，格式为 YYYY-MM" };
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) {
    return { error: "月份无效，请使用 YYYY-MM" };
  }
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return reportRangeValues(from, capReportDateKey(monthEnd));
}

export function reportRangeFromDays(daysValue, toValue) {
  const days = Math.floor(Number(daysValue));
  if (!Number.isFinite(days) || days < 1 || days > MAX_BACKFILL_DAYS) {
    return { error: `days 须为 1～${MAX_BACKFILL_DAYS} 的整数` };
  }
  const to = reportDateValue(toValue || todayProductKey());
  const from = addDays(to, -(days - 1));
  const range = reportRangeValues(from, to);
  if (range.error) return range;
  return { ...range, days };
}

function reportLane(category) {
  if (["政治", "政策", "地缘", "外交", "安全"].includes(category)) return "politics";
  if (["金融", "宏观", "市场", "经济"].includes(category)) return "finance";
  if (category === "科技") return "technology";
  return "other";
}

function buildReportSections(events) {
  const groups = new Map(REPORT_SECTION_DEFS.map((section) => [section.key, { ...section, events: [], subsections: [] }]));
  for (const event of events) {
    const lane = reportLane(event.category);
    groups.get(lane).events.push(event);
  }

  const other = groups.get("other");
  const byCategory = new Map();
  for (const event of other.events) {
    const key = event.category || "未分类";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(event);
  }
  other.subsections = [...byCategory.entries()].map(([title, items]) => ({ title, events: items }));

  return REPORT_SECTION_DEFS
    .map((section) => groups.get(section.key))
    .map((section) => ({
      ...section,
      count: section.events.length,
      subsections: section.key === "other" ? section.subsections : []
    }));
}

function impactText(event) {
  const risk = (event.impacts || []).find(([tone]) => tone === "risk");
  const market = (event.impacts || []).find(([tone]) => tone === "market");
  const policy = (event.impacts || []).find(([tone]) => tone === "policy");
  const selected = risk || market || policy;
  if (selected) return `${selected[1]}：${selected[2]}`;
  const desc = event.desc || event.summary || "";
  if (desc && !isOverviewFluff(desc)) return desc;
  return "";
}

const OVERVIEW_FLUFF_PATTERNS = [
  /监管与产业变动并行/,
  /风险与机会并存/,
  /局势升温/,
  /波动加剧/,
  /供应链压力抬升/,
  /暂无补充影响/,
  /已纳入.*线索/,
  /来自.*报道/,
  /重点涉及\s*$/,
  /发表演讲，属.+相关动态/,
  /涉及地缘冲突或安全局势/,
  /议题线索：/,
  /发布\/收录：/,
  /建议点击 ↗ 查看英文原文/,
  /出现值得跟踪的重要信息/,
  /围绕「[^」]+」：出现值得跟踪/,
  /存在值得跟踪的变化/,
  /呈上行或压力抬升/,
  /呈下行或节奏放缓/,
  /出现新的市场反应/,
  /相关报道[。；;]?$/,
  /^[A-Za-z][A-Za-z0-9、&_.-]{1,32}相关报道/,
  /Take、Future|Future、Take/
];

function clipOverviewText(text, max = 52) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1)}…`;
}

function cleanEventTitle(title) {
  const raw = String(title || "").replace(/\s+/g, " ").trim();
  const stripped = raw.match(/^(.{10,96}?)\s[-–—|｜]\s*.+$/);
  return stripped ? stripped[1].trim() : raw;
}

function isOverviewFluff(text) {
  const value = String(text || "").trim();
  if (!value || value.length < 8) return true;
  return OVERVIEW_FLUFF_PATTERNS.some((pattern) => pattern.test(value));
}

function eventBrief(event, maxLen = 52) {
  const fresh = presentEventForReport(event);
  const candidates = [
    overviewFactFromEvent(fresh, maxLen),
    stripLeadingLabel(String(fresh.desc || "").trim()),
    stripLeadingLabel(impactText(fresh))
  ];
  for (const line of candidates) {
    if (line && !isOverviewFluff(line) && !isOverviewJunkLine(line)) {
      return clipOverviewText(line, maxLen);
    }
  }
  return "";
}

function dedupeOverviewPoints(points) {
  const seen = new Set();
  return points.filter((point) => {
    const key = point.replace(/\s+/g, "").slice(0, 24);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isEnglishDominantBrief(text) {
  const cjk = (String(text || "").match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (String(text || "").match(/[A-Za-z]/g) || []).length;
  return latin > 12 && cjk < 6;
}

function buildOverviewPanelPoints(events, maxPoints = 5) {
  if (!events.length) return [];
  const points = [];
  const sorted = events
    .slice()
    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0) || new Date(b.occurredAt || 0) - new Date(a.occurredAt || 0));
  for (const event of sorted) {
    if (points.length >= maxPoints) break;
    const brief = eventBrief(event, 72);
    if (brief) points.push(brief);
  }
  return dedupeOverviewPoints(points);
}

function buildOverviewPanels(blocks) {
  const fallbacks = {
    international: "暂无突出新增",
    technology: "暂无突出新增",
    finance: "暂无显著变化"
  };
  return Object.fromEntries(
    OVERVIEW_PANEL_DEFS.map((def) => {
      const points = buildOverviewPanelPoints(blocks[def.key]?.events || []);
      return [
        def.key,
        {
          title: def.title,
          points: points.length ? points : [fallbacks[def.key]]
        }
      ];
    })
  );
}

function summarizeDirectionFacts(label, items, fallback) {
  if (!items.length) return `${label}：${fallback}`;
  const ranked = items
    .slice()
    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0));
  const facts = ranked
    .slice(0, 2)
    .map((event) => stripLeadingLabel(eventBrief(event), [label]))
    .filter(Boolean);
  if (!facts.length) return `${label}：${fallback}`;
  return `${label}：${facts.join("；")}。`;
}

function normalizeFocusCategoryName(name) {
  return String(name || "").trim().slice(0, 24);
}

function eventCorpus(event) {
  return [
    event.title,
    event.summary,
    event.displayTitle,
    event.category,
    event.region,
    ...(Array.isArray(event.tags) ? event.tags : [])
  ].join(" ").toLowerCase();
}

/** 将事件归入四块之一：国际局势 / 科技 / 金融 / 国内 */
export function classifyReportBlock(event) {
  const cat = String(event.category || "未分类").trim();
  const text = eventCorpus(event);

  if (cat === "科技" || /\b(ai|llm|chip|semiconductor|gpt|openai|anthropic)\b/i.test(text) || /算力|大模型|人工智能/.test(text)) {
    return "technology";
  }
  if (["金融", "宏观"].includes(cat) || /央行|利率|通胀|bond|stock market|gdp|汇率|降息|加息/.test(text)) {
    return "finance";
  }

  const otherLife = /医疗|健康|疾病|医院|疫苗|流感|疟疾|癌症|药品|医保|travel|旅行|签证|航班|酒店|民宿|春运|社保|公积金|房价|租房|外卖|地铁|生活成本|民生|幼儿园|学区|梗|热搜|meme|viral|娱乐|明星|网剧|短视频|tiktok|bilibili|微博热|豆瓣|票房|综艺/;
  const chinaDomestic = /中国|国内|本土|大陆|港澳|台湾|沪|深|京|国常会|发改委|工信部|国务院/;
  const intlGeo = /地缘|战争|冲突|制裁|外交|ukraine|russia|middle east|nato|gaza|中东|俄乌|红海|houthi|missile|ceasefire|geopolit|politics|security council/;

  if (otherLife.test(text) || (chinaDomestic.test(text) && !intlGeo.test(text) && cat !== "政治")) {
    return "domestic";
  }
  if (["政治", "地缘", "外交", "安全"].includes(cat) || intlGeo.test(text)) {
    return "international";
  }
  if (reportLane(cat) === "politics") return "international";
  if (reportLane(cat) === "finance") return "finance";
  if (reportLane(cat) === "technology") return "technology";
  if (chinaDomestic.test(text)) return "domestic";
  if (reportLane(cat) === "other") return "other";
  if (["气候", "产业", "能源", "未分类"].includes(cat)) return "other";
  return "other";
}

function buildFocusSections(events) {
  const buckets = Object.fromEntries(
    REPORT_BLOCK_DEFS.map((def) => [
      def.key,
      {
        key: def.key,
        title: def.title,
        description: def.description || "",
        summary: "",
        events: []
      }
    ])
  );

  for (const event of events) {
    const key = classifyReportBlock(event);
    buckets[key].events.push(event);
  }

  for (const def of REPORT_BLOCK_DEFS) {
    const block = buckets[def.key];
    block.events.sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0));
    const fallback = def.key === "domestic" ? "暂无国内向新增" : "暂无突出新增";
    block.summary = summarizeDirectionFacts(def.title, block.events, fallback);
  }

  return buckets;
}

function buildReportLayouts(events, overview, focusSections) {
  const top = events.slice(0, 3).map((item) => item.displayTitle || item.title);
  const riskEvents = events.filter((item) => Number(item.severity || 0) >= 85).slice(0, 3).map((item) => item.displayTitle || item.title);
  const blockTitles = REPORT_BLOCK_DEFS.map((def) => def.title).filter((title) => {
    const key = REPORT_BLOCK_DEFS.find((item) => item.title === title)?.key;
    return (focusSections?.[key]?.events || []).length > 0;
  });
  return {
    v1: {
      title: "管理速读版",
      highlights: top.length ? top : ["今日暂无高优先事件"],
      riskNotes: riskEvents.length ? riskEvents : ["暂无高风险事件升级"]
    },
    v2: {
      title: "研究分析版",
      threads: (overview?.bullets || []).slice(0, 5),
      focus: blockTitles.length ? blockTitles : ["暂无分块事件"]
    },
    v3: {
      title: "行动决策版",
      priorities: top.length ? top : ["建议补充事件输入"],
      nextActions: [
        "跟踪宏观事件后续 24h 进展",
        "复核关注方向是否需要新增",
        "对高风险事件补充二级证据源"
      ]
    }
  };
}

const CROSS_DAY_COLLECTION_RE = /（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/g;

export function normalizeOverviewSummary(summary, date, eventCount) {
  let text = String(summary || "")
    .replace(CROSS_DAY_COLLECTION_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!eventCount) {
    return `${date} 暂无匹配事件，日报保留空状态并等待新增来源。`;
  }
  const head = `${date} · ${eventCount} 条事件`;
  const tail = text
    .replace(/^\d{4}-\d{2}-\d{2}\s*·\s*\d+\s*条事件[^。]*。?\s*/, "")
    .trim();
  if (!tail) return `${head}。`;
  if (tail.startsWith(head)) return tail;
  return `${head}。${tail}`;
}

function buildReportOverview(date, events, focusSections = null, eventWindow = null) {
  const windowSuffix =
    eventWindow?.from &&
    eventWindow?.to &&
    eventWindow.from !== eventWindow.to &&
    eventWindow.from !== date &&
    eventWindow.to !== date
      ? `（含 ${eventWindow.from} 至 ${eventWindow.to} 收录）`
      : "";

  if (!events.length) {
    return {
      summary: `${date} 暂无匹配事件，日报保留空状态并等待新增来源。`,
      bullets: ["当前本地事件库未命中该日期", "建议补充来源或切换日期"],
      directions: {
        international: "国际局势：暂无突出新增",
        technology: "科技：暂无突出新增",
        finance: "金融：暂无显著变化",
        domestic: "国内：暂无国内向新增"
      },
      panels: buildOverviewPanels({})
    };
  }

  const majorCount = events.filter(isMajorEvent).length;
  const blocks = focusSections || buildFocusSections(events);
  const directions = {
    international: blocks.international?.summary || "国际局势：暂无突出新增",
    technology: blocks.technology?.summary || "科技：暂无突出新增",
    finance: blocks.finance?.summary || "金融：暂无显著变化",
    domestic: blocks.domestic?.summary || "国内：暂无国内向新增"
  };

  const leadFacts = events
    .slice()
    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))
    .slice(0, 3)
    .map((event) => eventBrief(event, 64))
    .filter(Boolean);

  const panels = buildOverviewPanels(blocks);
  const directionBullets = OVERVIEW_PANEL_DEFS.map(
    (def) => `${def.title}：${(panels[def.key]?.points || []).join("；")}`
  );

  const rawSummary = leadFacts.length
    ? `${date} · ${events.length} 条事件${windowSuffix}。${leadFacts.join("；")}。`
    : `${date} 日报纳入 ${events.length} 条事件，重大 ${majorCount} 条${windowSuffix}。`;

  return {
    summary: normalizeOverviewSummary(rawSummary, date, events.length),
    bullets: directionBullets,
    directions,
    panels
  };
}

function reviewReport(report) {
  const window = report.eventWindow || { from: report.date, to: report.date };
  const inWindow = (event) => {
    const day = productDateKey(event.occurredAt);
    if (!day) return true;
    return day >= window.from && day <= window.to;
  };
  const checks = [
    {
      name: "日期范围",
      ok: report.events.every(inWindow)
    },
    {
      name: "事件完整度",
      ok: report.events.every((event) => event.id && event.title && event.summary)
    },
    {
      name: "参考存在性",
      ok: report.events.length === report.references.length
    },
    {
      name: "结构完整性",
      ok: Boolean(report.overview?.summary && Array.isArray(report.events) && Array.isArray(report.references) && Array.isArray(report.sections))
    },
    {
      name: "主类目归并",
      ok: ["politics", "finance", "technology", "other"].every((key) => report.sections.some((section) => section.key === key))
    },
    {
      name: "日报四块结构",
      ok: ["international", "technology", "finance", "domestic"].every(
        (key) => report.focusSections?.[key] && Array.isArray(report.focusSections[key].events)
      )
    }
  ];

  return {
    status: checks.every((check) => check.ok) ? "reviewed" : "reviewed_with_warnings",
    count: 1,
    reviewer: "local-rule-review",
    reviewedAt: nowIso(),
    checks: checks.map((check) => check.name),
    findings: checks.map((check) => ({
      check: check.name,
      ok: check.ok,
      note: check.ok ? "通过" : "需要补充或核实"
    })),
    note: "本次 review 基于本地事件库的日期、字段、参考与结构完整性检查；外部真实性仍需接入权威来源后继续增强。"
  };
}

export function filterEvents(events, { category, fromDate, toDate, majorOnly }) {
  return events
    .filter((event) => !category || category === "全部" || event.category === category)
    .filter((event) => {
      if (majorOnly && !isMajorEvent(event)) return false;
      if (!fromDate && !toDate) return true;
      if (inDateRange(event.occurredAt, fromDate, toDate)) return true;
      return event.timeline.some((point) => inDateRange(point.at, fromDate, toDate));
    })
    .sort((a, b) => {
      if (b.severity !== a.severity) return b.severity - a.severity;
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    });
}

export async function listEvents(searchParams, fromDate = null, toDate = null) {
  const store = await readEventStore();
  const category = searchParams.get("category");
  const majorOnly = searchParams.get("majorOnly") === "1";
  const filtered = filterEvents(store.events, { category, fromDate, toDate, majorOnly });
  const events = filtered.map((event, index) => toPublicEvent(event, index + 1));
  return {
    events,
    range: {
      from: fromDate && !Number.isNaN(fromDate.getTime()) ? fromDate.toISOString() : null,
      to: toDate && !Number.isNaN(toDate.getTime()) ? toDate.toISOString() : null
    },
    total: events.length
  };
}

export async function listTodayMajor(searchParams) {
  const store = await readEventStore();
  const category = searchParams.get("category");
  const filtered = store.events
    .filter((event) => isTodayEvent(event) && isMajorEvent(event))
    .filter((event) => !category || category === "全部" || event.category === category)
    .sort((a, b) => b.severity - a.severity);
  const events = filtered.map((event, index) => toPublicEvent(event, index + 1));
  return { date: todayProductKey(), events, total: events.length };
}

function reportPresentationBuilders() {
  return {
    buildFocusSections,
    buildReportOverview,
    buildReportLayouts,
    reviewReport
  };
}

function migrateLegacyFocusSections(report) {
  if (!report?.focusSections?.other || report.focusSections.domestic) return report;
  return {
    ...report,
    focusSections: {
      ...report.focusSections,
      domestic: report.focusSections.other,
      other: undefined
    }
  };
}

async function getArchivedReportSnapshot(date) {
  const store = await readReportStore();
  const item = store.reports.find((entry) => entry.date === date);
  return item?.report ? migrateLegacyFocusSections(item.report) : null;
}

function sanitizeReportForDate(report, date) {
  const events = (report.events || []).filter(
    (event) => productDateKey(event.occurredAt) === date
  );
  return {
    ...report,
    date,
    events,
    eventWindow: { from: date, to: date }
  };
}

function isPollutedTodaySnapshot(report, date) {
  if (!report || date !== todayProductKey()) return false;
  const crossDaySummary = /（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/.test(
    report.overview?.summary || ""
  );
  const crossDayEvents = (report.events || []).some(
    (event) => productDateKey(event.occurredAt) !== date
  );
  const crossDayWindow =
    report.eventWindow?.from !== date || report.eventWindow?.to !== date;
  return crossDaySummary || crossDayEvents || crossDayWindow;
}

function rePresentReportEvents(report, date) {
  const sanitized = sanitizeReportForDate(report, date);
  const events = (sanitized.events || []).map((event) => presentEventForReport(event));
  const focusSections = buildFocusSections(events);
  const sections = buildReportSections(events);
  const overview = buildReportOverview(date, events, focusSections, sanitized.eventWindow);
  const references = events.map((event) => {
    const sourceRef = Array.isArray(event.references) ? event.references[0] : null;
    return {
      id: sourceRef?.id || `ref-${event.id}`,
      eventId: event.id,
      title: sourceRef?.title || event.title,
      source: sourceRef?.source || "本地事件库",
      url: sourceRef?.url || "",
      provider: sourceRef?.provider || "local",
      category: event.category,
      occurredAt: sourceRef?.publishedAt || event.occurredAt,
      accessedAt: sourceRef?.accessedAt || nowIso()
    };
  });
  return {
    ...sanitized,
    events,
    focusSections,
    sections,
    references,
    overview,
    reportLayouts: buildReportLayouts(events, overview, focusSections)
  };
}

async function finalizeReportForRead(report, date) {
  const builders = reportPresentationBuilders();
  let finalized = sanitizeReportForDate(migrateLegacyFocusSections({ ...report }), date);
  delete finalized.timeline;
  delete finalized.timelineByLane;
  delete finalized.relatedMaterials;
  delete finalized.presentation;
  delete finalized.nextRefreshAt;
  delete finalized.lastRefreshedAt;
  delete finalized.refreshIntervalHours;

  finalized = rePresentReportEvents(finalized, date);
  finalized.review = reviewReport(finalized);

  if (shouldUseTimelinePresentation(date)) {
    const refreshIntervalHours = await getRefreshIntervalHours();
    finalized = attachTodayTimeline(finalized, classifyReportBlock, refreshIntervalHours);
    return {
      ...finalized,
      date,
      title: reportDisplayTitle(date, finalized.title)
    };
  }

  if (report.presentation === "timeline") {
    finalized = compressTimelineToArchived(finalized, builders);
  }
  return {
    ...finalized,
    date,
    title: reportDisplayTitle(date, finalized.title)
  };
}

export async function repairStoredEventSummaries() {
  const store = await readEventStore();
  let repaired = 0;
  store.events = store.events.map((event) => {
    const presented = presentEventForReport(event);
    const nextSummary = presented.desc || presented.summary;
    const poisoned =
      isTemplateFluff(String(event.summary || ""))
      || /；对象：|值得跟踪|呈下行/.test(String(event.summary || ""));
    if (!poisoned && event.summary === nextSummary && event.displayTitle === presented.displayTitle) {
      return event;
    }
    repaired += 1;
    const timeline = (event.timeline || []).map((point) => {
      const text = String(point.text || "").trim();
      return {
        ...point,
        text: isTemplateFluff(text) || /；对象：|值得跟踪/.test(text) ? nextSummary : text
      };
    });
    return {
      ...event,
      summary: nextSummary,
      displayTitle: presented.displayTitle,
      timeline,
      updatedAt: nowIso()
    };
  });
  if (repaired > 0) await writeEventStore(store);
  return repaired;
}

/** 只读生成日报；不写归档库（避免刷新/并发读触发 500） */
export async function getDailyReport(searchParams) {
  const date = reportDateFrom(searchParams);
  if (date > todayProductKey()) {
    return { error: "不能查询未来日期的日报" };
  }
  const mode = reportModeFrom(searchParams);

  if (!shouldUseTimelinePresentation(date)) {
    const snapshot = await getArchivedReportSnapshot(date);
    if (snapshot) return finalizeReportForRead(snapshot, date);
  }

  const report = await buildDailyReport(date, mode);
  const finalized = await finalizeReportForRead(report, date);
  return finalized;
}

async function buildDailyReport(date, reportMode = "v2") {
  const store = await readEventStore();
  const focusCategories = Array.isArray(store.focusCategories) && store.focusCategories.length
    ? store.focusCategories
    : DEFAULT_FOCUS_CATEGORIES;
  const { reportEvents, eventWindow } = resolveReportEvents(store, date);

  const events = reportEvents.map((event, index) => ({
    ...presentEventForReport(toPublicEvent(event, index + 1)),
    impact: impactText(event)
  }));

  const references = reportEvents.map((event) => {
    const sourceRef = Array.isArray(event.references) ? event.references[0] : null;
    return {
      id: sourceRef?.id || `ref-${event.id}`,
      eventId: event.id,
      title: sourceRef?.title || event.title,
      source: sourceRef?.source || "本地事件库 data/auto-info-store.json",
      url: sourceRef?.url || "",
      provider: sourceRef?.provider || "local",
      category: event.category,
      occurredAt: sourceRef?.publishedAt || event.occurredAt,
      accessedAt: sourceRef?.accessedAt || nowIso()
    };
  });

  const report = {
    date,
    title: reportDisplayTitle(date),
    reportMode,
    generatedAt: nowIso(),
    eventWindow,
    focusCategories,
    focusSections: buildFocusSections(events),
    overview: null,
    events,
    sections: buildReportSections(events),
    references,
    status: emptySourceStatus({ eventCount: events.length })
  };
  report.overview = buildReportOverview(date, events, report.focusSections, eventWindow);
  report.reportLayouts = buildReportLayouts(events, report.overview, report.focusSections);
  report.review = reviewReport(report);
  return report;
}

async function archiveDailyReport(report, reason = "operation") {
  const builders = reportPresentationBuilders();
  let snapshotReport = migrateLegacyFocusSections(report);
  if (snapshotReport.presentation === "timeline" && !shouldUseTimelinePresentation(snapshotReport.date)) {
    snapshotReport = compressTimelineToArchived(snapshotReport, builders);
  }
  snapshotReport = {
    ...snapshotReport,
    title: reportDisplayTitle(snapshotReport.date, snapshotReport.title)
  };

  if (!snapshotReport.review || Number(snapshotReport.review.count || 0) < 1) {
    return { error: "日报缺少 review，无法归档" };
  }

  const storedAt = nowIso();
  const snapshot = {
    id: `report-${report.date}`,
    date: report.date,
    storedAt,
    reason,
    report: snapshotReport
  };
  const store = await mutateReportStore((current) => {
    current.reports = [snapshot, ...current.reports.filter((item) => item.date !== report.date)].slice(0, 120);
    return current;
  });

  return {
    ok: true,
    date: report.date,
    storedAt,
    reason,
    totalReports: store.reports.length
  };
}

export async function storeDailyReport(body = {}) {
  const date = reportDateValue(body.date);
  const report = await finalizeReportForRead(await buildDailyReport(date), date);
  const archived = await archiveDailyReport(report, body.reason || "explicit");
  if (archived.error) return archived;
  return {
    ...archived,
    report
  };
}

function dailyTopics(inputTopics) {
  if (!Array.isArray(inputTopics) || !inputTopics.length) return REPORT_TOPIC_QUERIES;
  return inputTopics
    .map((item) => {
      if (typeof item === "string") return { title: item, category: item, query: `${item} latest` };
      return {
        title: String(item.title || item.category || "其他"),
        category: String(item.category || item.title || "其他"),
        query: String(item.query || `${item.title || item.category || "news"} latest`)
      };
    })
    .filter((item) => item.query.trim());
}

function articleToDailyEvent(article, topic, index, date) {
  const source = article.source || article.provider || "external";
  const publishedAt = article.publishedAt || `${date}T12:00:00.000Z`;
  const tags = new Set([topic.title, "外部来源", "日报更新"]);
  if (index < 2) tags.add("重大");
  const base = {
    id: `news-${safeSlug(topic.title)}-${safeSlug(article.provider || "source")}-${safeSlug(article.url || article.title)}`,
    title: article.title,
    category: topic.category,
    region: article.region || "全球",
    summary: article.summary || `来自 ${source} 的 ${date} 报道，已纳入${topic.title}日报线索。`,
    tags: [...tags],
    severity: Math.max(60, 86 - index * 4),
    special: index < 2,
    occurredAt: publishedAt,
    references: [
      {
        title: article.title,
        source,
        url: article.url || "",
        provider: article.provider || "external",
        publishedAt,
        accessedAt: nowIso()
      }
    ],
    timeline: []
  };
  const presented = presentEventForReport(base);
  base.summary = presented.desc || base.summary;
  base.timeline = [
    {
      at: publishedAt,
      label: "要点",
      text: presented.desc || base.summary
    }
  ];
  return base;
}

async function upsertEventInputs(inputs) {
  const normalized = inputs.filter((item) => item && item.title).map((item, index) => normalizeEvent(item, index));
  if (!normalized.length) return { upserted: 0 };

  const store = await readEventStore();
  for (const nextEvent of normalized) {
    const index = store.events.findIndex((item) => item.id === nextEvent.id);
    if (index >= 0) {
      store.events[index] = {
        ...store.events[index],
        ...nextEvent,
        timeline: dedupeByAt([...(store.events[index].timeline || []), ...(nextEvent.timeline || [])]).sort(
          (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
        ),
        updatedAt: nowIso()
      };
    } else {
      store.events.push(nextEvent);
    }
  }
  await writeEventStore(store);
  return { upserted: normalized.length };
}

async function pullDailySourceEvents(date, topics) {
  const sourceSearches = [];
  const eventMap = new Map();

  for (const topic of topics) {
    const sourceSearch = await searchLatestNews(topic.query, { limit: 5, date });
    sourceSearches.push({
      topic: topic.title,
      query: topic.query,
      providerStatuses: sourceSearch.providerStatuses,
      articleCount: sourceSearch.articles.length
    });
    sourceSearch.articles.forEach((article, index) => {
      const eventInput = articleToDailyEvent(article, topic, index, date);
      if (!eventMap.has(eventInput.id)) eventMap.set(eventInput.id, eventInput);
    });
  }

  const result = await upsertEventInputs([...eventMap.values()]);
  return { updated: result.upserted, sourceSearches };
}

export async function updateDailyReport(body = {}) {
  const date = reportDateValue(body.date);
  if (date > todayProductKey()) {
    return { error: "不能更新未来日期的日报" };
  }
  const reportMode = ["v1", "v2", "v3"].includes(String(body.reportMode || "")) ? String(body.reportMode) : "v2";
  const pullSources = body.pullSources !== false;
  let updated = 0;
  let sourceSearches = [];

  if (pullSources) {
    const pulled = await pullDailySourceEvents(date, dailyTopics(body.topics));
    updated = pulled.updated;
    sourceSearches = pulled.sourceSearches;
  }

  const repairedSummaries = await repairStoredEventSummaries();
  const report = await finalizeReportForRead(await buildDailyReport(date, reportMode), date);
  const status = deriveSourceStatus({ eventCount: report.events?.length || 0, sourceSearches });
  report.status = status;
  const archive = await archiveDailyReport(report, pullSources ? "daily_update" : "daily_rebuild");
  return { ok: true, date, updated, repairedSummaries, status, sourceSearches, report, archive };
}

function enumerateMonthKeys(fromKey, toKey) {
  const months = [];
  let year = Number(fromKey.slice(0, 4));
  let month = Number(fromKey.slice(5, 7));
  const endYear = Number(toKey.slice(0, 4));
  const endMonth = Number(toKey.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

function aggregateBackfillChunks(chunks) {
  const reports = chunks.flatMap((chunk) => chunk.reports || []);
  return {
    ok: true,
    chunked: true,
    chunks: chunks.length,
    from: chunks[0]?.from,
    to: chunks[chunks.length - 1]?.to,
    totalDays: reports.length,
    totalUpdated: chunks.reduce((sum, chunk) => sum + (chunk.totalUpdated || 0), 0),
    reports,
    report: chunks[chunks.length - 1]?.report || null
  };
}

export async function backfillDailyReports(body = {}) {
  const hasExplicitRange =
    body.from
    && body.to
    && body.month == null
    && (body.days == null || body.days === "");

  if (hasExplicitRange) {
    const from = parseReportDate(body.from);
    const toKey = capReportDateKey(body.to || todayProductKey());
    if (!from || !toKey) {
      return { error: "请提供有效的 from 和 to" };
    }
    const daySpan =
      Math.round((new Date(`${toKey}T00:00:00.000Z`).getTime() - from.getTime()) / (24 * 3600 * 1000)) + 1;
    if (daySpan > MAX_BACKFILL_DAYS) {
      const months = enumerateMonthKeys(body.from.slice(0, 7), toKey.slice(0, 7));
      const chunks = [];
      for (const month of months) {
        const chunk = await backfillDailyReports({
          month,
          pullSources: body.pullSources,
          topics: body.topics,
          reportMode: body.reportMode
        });
        if (chunk.error) return chunk;
        chunks.push(chunk);
      }
      return aggregateBackfillChunks(chunks);
    }
  }

  const range = body.month
    ? reportRangeFromMonth(body.month)
    : body.days != null && body.days !== ""
      ? reportRangeFromDays(body.days, body.to)
      : reportRangeValues(body.from, body.to);
  if (range.error) return range;

  const reports = [];
  let totalUpdated = 0;
  let lastReport = null;
  for (const date of range.dates) {
    const result = await updateDailyReport({
      date,
      pullSources: body.pullSources !== false,
      topics: body.topics,
      reportMode: body.reportMode
    });
    totalUpdated += result.updated || 0;
    lastReport = result.report;
    reports.push({
      date,
      updated: result.updated || 0,
      eventCount: result.report?.events?.length || 0,
      reviewStatus: result.report?.review?.status || "unknown",
      archive: result.archive,
      sourceSearches: result.sourceSearches
    });
  }

  return {
    ok: true,
    month: body.month || range.month || range.from?.slice(0, 7),
    days: range.days ?? (body.days != null && body.days !== "" ? Number(body.days) : undefined),
    from: range.from,
    to: range.to,
    totalDays: range.dates.length,
    totalUpdated,
    reports,
    report: lastReport
  };
}

export async function listStoredReports(searchParams) {
  const store = await readReportStore();
  const limit = Math.max(1, Math.min(120, Number(searchParams.get("limit") || 30)));
  const today = todayProductKey();
  const items = store.reports
    .filter((item) => String(item.date || "") <= today)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, limit)
    .map((item) => {
      const day = item.date;
      const sameDayCount = (item.report?.events || []).filter(
        (event) => productDateKey(event.occurredAt) === day
      ).length;
      const summaryPreview = item.report?.overview?.summary || "";
      const cleanPreview =
        day === today && /（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/.test(summaryPreview)
          ? `${day} 暂无匹配事件，日报保留空状态并等待新增来源。`
          : summaryPreview;
      return {
        id: item.id,
        date: day,
        storedAt: item.storedAt,
        reason: item.reason || "operation",
        title: reportDisplayTitle(day, item.report?.title),
        eventCount: sameDayCount,
        reviewStatus: item.report?.review?.status || "unknown",
        reviewCount: item.report?.review?.count || 0,
        summaryPreview: cleanPreview
      };
    });
  return { items, total: store.reports.length };
}

export async function deleteStoredReport(dateValue) {
  const date = reportDateValue(dateValue);
  let deleted = false;
  const store = await mutateReportStore((current) => {
    const before = current.reports.length;
    current.reports = current.reports.filter((item) => item.date !== date);
    deleted = current.reports.length !== before;
    return current;
  });
  return { ok: true, date, deleted, totalReports: store.reports.length };
}

export async function listSearchHistory(searchParams) {
  const store = await readEventStore();
  const limit = Math.max(1, Math.min(100, Number(searchParams.get("limit") || 20)));
  const items = (store.queryHistory || []).slice(0, limit);
  return { items, total: (store.queryHistory || []).length };
}

export async function listHistory(searchParams) {
  const store = await readEventStore();
  const fromDate = searchParams.get("from") ? new Date(searchParams.get("from")) : null;
  const toDate = searchParams.get("to") ? new Date(searchParams.get("to")) : null;
  const events = store.events
    .filter((event) => inDateRange(event.occurredAt, fromDate, toDate))
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
    .map((event) => ({
      id: event.id,
      title: event.title,
      category: event.category,
      occurredAt: event.occurredAt,
      severity: event.severity
    }));
  return { events, total: events.length };
}

export async function getEventTimeline(eventId, searchParams) {
  const store = await readEventStore();
  const event = store.events.find((item) => item.id === eventId);
  if (!event) return null;
  const fromDate = searchParams.get("from") ? new Date(searchParams.get("from")) : null;
  const toDate = searchParams.get("to") ? new Date(searchParams.get("to")) : null;
  const shouldFill = searchParams.get("fill") === "1";
  const timeline = shouldFill
    ? fillTimelinePoints(event, fromDate, toDate)
    : event.timeline.filter((point) => inDateRange(point.at, fromDate, toDate));
  return { eventId, timeline, total: timeline.length };
}

export async function fillEventTimeline(eventId, body) {
  const store = await readEventStore();
  const eventIndex = store.events.findIndex((item) => item.id === eventId);
  if (eventIndex < 0) return null;
  const fromDate = body.from ? new Date(body.from) : null;
  const toDate = body.to ? new Date(body.to) : null;
  if (!fromDate || !toDate || Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime()) || fromDate > toDate) {
    return { error: "请提供有效的 from 和 to，且 from <= to" };
  }
  const nextTimeline = fillTimelinePoints(store.events[eventIndex], fromDate, toDate);
  store.events[eventIndex].timeline = nextTimeline;
  store.events[eventIndex].updatedAt = nowIso();
  await writeEventStore(store);
  return { ok: true, eventId, timelineCount: nextTimeline.length };
}

export async function listFocusCategories() {
  const store = await readEventStore();
  const items = Array.isArray(store.focusCategories) && store.focusCategories.length
    ? store.focusCategories
    : DEFAULT_FOCUS_CATEGORIES;
  return { items, total: items.length };
}

export async function addFocusCategory(body = {}) {
  const name = normalizeFocusCategoryName(body.name);
  if (!name) return { error: "请提供关注类别名称" };
  const store = await readEventStore();
  const current = Array.isArray(store.focusCategories) && store.focusCategories.length
    ? store.focusCategories
    : [...DEFAULT_FOCUS_CATEGORIES];
  if (!current.includes(name)) current.push(name);
  store.focusCategories = current.slice(0, 24);
  await writeEventStore(store);
  return { ok: true, items: store.focusCategories, total: store.focusCategories.length };
}

export async function removeFocusCategory(nameValue) {
  const name = normalizeFocusCategoryName(nameValue);
  if (!name) return { error: "请提供关注类别名称" };
  const store = await readEventStore();
  const current = Array.isArray(store.focusCategories) && store.focusCategories.length
    ? store.focusCategories
    : [...DEFAULT_FOCUS_CATEGORIES];
  const next = current.filter((item) => item !== name);
  store.focusCategories = next.length ? next : [...DEFAULT_FOCUS_CATEGORIES];
  await writeEventStore(store);
  return {
    ok: true,
    deleted: next.length !== current.length,
    items: store.focusCategories,
    total: store.focusCategories.length
  };
}

export async function upsertEvents(body) {
  const store = await readEventStore();
  const incoming = Array.isArray(body.events) ? body.events : [body];
  const normalized = incoming.filter((item) => item && item.title).map((item, index) => normalizeEvent(item, index));
  if (!normalized.length) return { error: "至少需要一个带 title 的事件" };

  for (const nextEvent of normalized) {
    const index = store.events.findIndex((item) => item.id === nextEvent.id);
    if (index >= 0) {
      store.events[index] = {
        ...store.events[index],
        ...nextEvent,
        timeline: dedupeByAt([...(store.events[index].timeline || []), ...(nextEvent.timeline || [])]).sort(
          (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
        ),
        updatedAt: nowIso()
      };
    } else {
      store.events.push(nextEvent);
    }
  }
  await writeEventStore(store);
  await repairStoredEventSummaries();
  const date = todayProductKey();
  const report = await finalizeReportForRead(await buildDailyReport(date), date);
  const archive = await archiveDailyReport(report, "events_upsert");
  return { ok: true, upserted: normalized.length, archive };
}

export async function refreshTodayHeadlines() {
  const store = await readEventStore();
  if (!store.events.length) {
    return { ok: true, refreshed: 0, total: 0, message: "暂无事件可刷新" };
  }

  const now = Date.now();
  const majorCandidates = store.events
    .filter((event) => event.special || event.tags.includes("重大"))
    .sort((a, b) => b.severity - a.severity);

  const targets = (majorCandidates.length ? majorCandidates : [...store.events].sort((a, b) => b.severity - a.severity)).slice(0, 8);

  targets.forEach((event, index) => {
    const occurredAt = new Date(now - index * 10 * 60 * 1000).toISOString();
    event.occurredAt = occurredAt;
    event.updatedAt = nowIso();
    event.special = true;
    if (!event.tags.includes("重大")) event.tags.unshift("重大");
  });

  await writeEventStore(store);
  const date = todayProductKey();
  await repairStoredEventSummaries();
  const report = await finalizeReportForRead(await buildDailyReport(date), date);
  const archive = await archiveDailyReport(report, "refresh");
  return { ok: true, refreshed: targets.length, total: store.events.length, date, archive };
}
