import { readEventStore, writeEventStore } from "../../shared/store.mjs";
import { safeSlug, nowIso } from "../../shared/utils.mjs";
import { toPublicEvent } from "../../shared/event-model.mjs";
import { storeDailyReport, upsertEvents } from "./service.mjs";
import { hasFreshnessIntent, searchLatestNews } from "./news-sources.mjs";
import {
  intakeMatchThreshold,
  intakeQueryTerms,
  scoreIntakeEvent
} from "./intake-match.mjs";
import {
  buildChineseEventIntro,
  normalizeNewsText,
  presentEventForReport,
  shouldLocalizeEventSummary
} from "./event-display.mjs";

const CATEGORY_RULES = [
  { category: "科技", patterns: /AI|芯片|算力|半导体|模型|科技|出口限制|云服务/i },
  { category: "宏观", patterns: /央行|利率|通胀|GDP|汇率|降息|宏观|债券收益率/i },
  { category: "金融", patterns: /银行|信用|债券|REIT|贷款|金融|违约|私募/i },
  { category: "地缘", patterns: /地缘|战争|制裁|航运|红海|港口|冲突|保险/i },
  { category: "气候", patterns: /气候|干旱|农产品|天气|降雨|热浪|作物/i },
  { category: "产业", patterns: /新能源|汽车|电池|产业|价格战|整车|渠道|制造/i },
  { category: "政策", patterns: /政策|监管|合规|版权|立法|许可|出口/i },
  { category: "能源", patterns: /能源|电力|油气|电网|储能|天然气|数据中心/i }
];

const CATEGORY_TAGS = {
  科技: ["科技", "供应链"],
  宏观: ["宏观", "利率"],
  金融: ["金融", "风险"],
  地缘: ["地缘", "供应链"],
  气候: ["气候", "农产品"],
  产业: ["产业", "现金流"],
  政策: ["政策", "合规"],
  能源: ["能源", "基础设施"],
  未分类: ["观察"]
};

export function inferCategory(query, explicitCategory) {
  if (explicitCategory && explicitCategory !== "全部" && explicitCategory !== "自动") {
    return explicitCategory;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.test(query)) return rule.category;
  }
  return "未分类";
}

function inferTags(query, category) {
  const tags = new Set(CATEGORY_TAGS[category] || CATEGORY_TAGS["未分类"]);
  if (/重大|风险|危机/.test(query)) tags.add("重大");
  if (/出口|限制|制裁/.test(query)) tags.add("政策");
  if (/供应链|航运|物流/.test(query)) tags.add("供应链");
  return [...tags];
}

function buildSummary(query, category, relatedTitles) {
  const related = relatedTitles.length ? `同类事件：${relatedTitles.join("；")}。` : "";
  return `围绕「${query}」建立的${category}类观察条目。${related}建议补充来源链接、时间线与影响指标。`;
}

function articleToEvent(article, query, category, index) {
  const source = article.source || article.provider || "external";
  const publishedAt = article.publishedAt || nowIso();
  const tags = new Set([...inferTags(query, category), "最新", "外部来源"]);
  if (index < 3) tags.add("重大");
  const title = normalizeNewsText(article.title);
  const rawSummary = normalizeNewsText(article.summary);
  const draft = { title, category, summary: rawSummary };
  const summary = shouldLocalizeEventSummary(draft)
    ? buildChineseEventIntro(draft)
    : rawSummary || buildChineseEventIntro(draft);
  const base = {
    id: `news-${safeSlug(article.provider || "source")}-${safeSlug(article.url || article.title)}`,
    title,
    category,
    region: article.region || "全球",
    summary,
    tags: [...tags],
    severity: Math.max(62, 84 - index * 4),
    special: index < 3,
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
  base.summary = presented.desc || summary;
  base.timeline = [
    {
      at: publishedAt,
      label: "要点",
      text: presented.desc || summary
    }
  ];
  return base;
}

function sourceSummary(query, sourceSearch, fallbackSummary) {
  if (!sourceSearch?.attempted) return fallbackSummary;
  if (sourceSearch.articles?.length) {
    const titles = sourceSearch.articles.slice(0, 3).map((article) => `「${article.title}」`).join("、");
    return `已检索「${query}」的最新来源 ${sourceSearch.articles.length} 条，优先纳入：${titles}。`;
  }
  const providers = (sourceSearch.providerStatuses || [])
    .map((item) => `${item.provider}:${item.status}`)
    .join(" / ");
  return `已尝试外部最新检索，但暂无可入库结果（${providers || "no providers"}）。${fallbackSummary}`;
}

export async function intakeEventQuery(body) {
  const query = String(body.query || "").trim();
  if (!query) return { error: "请提供 query 字段" };

  const inferredCategory = inferCategory(query, body.category);
  const terms = intakeQueryTerms(query);
  const matchThreshold = intakeMatchThreshold(terms, query);
  const shouldSearchLatest = Boolean(body.searchLatest) || hasFreshnessIntent(query);
  let sourceSearch = {
    attempted: false,
    searchedAt: null,
    query,
    providerStatuses: [],
    articles: []
  };
  let created = false;
  let createdEvent = null;

  if (shouldSearchLatest) {
    sourceSearch = await searchLatestNews(query, { limit: 6 });
    if (sourceSearch.articles.length) {
      const sourceEvents = sourceSearch.articles.map((article, index) => articleToEvent(article, query, inferredCategory, index));
      const result = await upsertEvents({ events: sourceEvents });
      if (result.error) return result;
      created = true;
      const refreshed = await readEventStore();
      createdEvent = refreshed.events.find((event) => event.id === sourceEvents[0].id) || null;
    }
  }

  const store = await readEventStore();
  const scored = store.events
    .map((event) => ({ event, score: scoreIntakeEvent(event, query, terms, inferredCategory) }))
    .filter((item) => item.score >= matchThreshold)
    .sort((a, b) => b.score - a.score || b.event.severity - a.event.severity);

  const bestScore = scored[0]?.score || 0;
  const shouldCreate = !scored.length || bestScore < matchThreshold;

  if (!sourceSearch.articles.length && shouldCreate) {
    const relatedTitles = scored.slice(0, 3).map((item) => item.event.title);
    const eventInput = {
      id: safeSlug(query),
      title: query,
      category: inferredCategory,
      region: body.region || "全球",
      summary: body.summary || buildSummary(query, inferredCategory, relatedTitles),
      // 标记为「未核实」占位：无真实来源，仅作纳入观察用，不应占据近期动态榜
      tags: [...inferTags(query, inferredCategory), "未核实"],
      severity: Number(body.severity) || 68,
      special: /重大/.test(query),
      occurredAt: nowIso(),
      timeline: [
        {
          at: nowIso(),
          label: "今日",
          text: `用户输入主题「${query}」，系统按${inferredCategory}类目入库并纳入观察列表。`
        }
      ]
    };
    const result = await upsertEvents(eventInput);
    if (result.error) return result;
    created = true;
    const refreshed = await readEventStore();
    createdEvent = refreshed.events.find((e) => e.id === eventInput.id) || null;
  }

  const latestStore = await readEventStore();
  const allScored = latestStore.events
    .map((event) => ({ event, score: scoreIntakeEvent(event, query, terms, inferredCategory) }))
    .filter((item) => item.score >= matchThreshold || item.event.id === createdEvent?.id)
    .sort((a, b) => b.score - a.score || b.event.severity - a.event.severity);

  const matches = allScored.slice(0, 8).map((item, index) => toPublicEvent(item.event, index + 1));
  const categoryEvents = latestStore.events
    .filter((event) => event.category === inferredCategory)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 12)
    .map((event, index) => toPublicEvent(event, index + 1));

  const topLocalMatch = matches.find((item) => item.id !== createdEvent?.id) || matches[0] || null;
  const resultEvent = createdEvent ? toPublicEvent(createdEvent, 1) : topLocalMatch;
  const fallbackSummary = resultEvent?.summary || `围绕「${query}」暂无匹配事件。`;
  const historyItem = {
    id: `hist-${Date.now()}-${safeSlug(query)}`,
    query,
    inferredCategory,
    created,
    eventId: resultEvent?.id || null,
    resultTitle: resultEvent?.title || query,
    resultSummary: sourceSummary(query, sourceSearch, fallbackSummary),
    matchCount: matches.length,
    sourceCount: sourceSearch.articles.length,
    sourceProviders: sourceSearch.providerStatuses,
    createdAt: nowIso()
  };
  if (body.skipHistory !== true) {
    latestStore.queryHistory = [historyItem, ...(latestStore.queryHistory || [])].slice(0, 100);
  }
  await writeEventStore(latestStore);
  const archive = body.skipArchive === true ? null : await storeDailyReport({ reason: "intake" });

  return {
    query,
    inferredCategory,
    matches,
    categoryEvents,
    totalMatches: matches.length,
    totalInCategory: categoryEvents.length,
    created,
    sourceSearch,
    historyItem,
    archive,
    event: resultEvent
  };
}
