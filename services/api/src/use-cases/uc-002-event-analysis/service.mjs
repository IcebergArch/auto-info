import { readEventStore } from "../../shared/store.mjs";
import { parseTagsParam } from "../../shared/utils.mjs";
import { queryNeo4jGraph, saveNeo4jGraph } from "../../shared/neo4j-graph.mjs";
import { intakeEventQuery } from "../uc-001-daily-events/intake.mjs";
import { recallEventsFromMysql, upsertEventsToMysql } from "../../shared/mysql-events.mjs";
import { resolveAnalysisWindow } from "./analysis-window.mjs";
import { buildEventChronology } from "./timeline-build.mjs";
import { enrichEventsFromIntel } from "./intel-enrich.mjs";
import { buildEventLines } from "./event-lines-build.mjs";
import { isTechAiQuery, matchesAnalysisQuery, matchesQuery } from "./match-query.mjs";
import { buildObjectBriefing } from "./object-briefing.mjs";

const IMPACT_LABELS = {
  policy: "政策传导",
  market: "市场影响",
  technology: "科技产业",
  risk: "地缘风险"
};

const DIMENSION_DEPTH = {
  policy: 1,
  market: 2,
  technology: 3,
  risk: 1
};

function tokenize(text) {
  const domainTerms = [
    "AI", "芯片", "算力", "出口", "供应链", "能源", "航运", "央行", "利率", "通胀",
    "政策", "监管", "金融", "信用", "气候", "农产品", "电力", "数据中心", "版权", "合规"
  ];
  const lower = String(text || "").toLowerCase();
  const found = domainTerms.filter((term) => lower.includes(term.toLowerCase()));
  const english = (text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || []).map((w) => w.toLowerCase());
  return new Set([...found.map((t) => t.toLowerCase()), ...english]);
}

function sharedTags(a, b, selectedTags) {
  const setA = new Set(a.tags);
  const setB = new Set(b.tags);
  const shared = [...setA].filter((tag) => setB.has(tag));
  const highlighted = shared.filter((tag) => selectedTags.includes(tag));
  return highlighted.length ? highlighted : shared;
}

function inferQueryLane(query) {
  const text = String(query || "").toLowerCase();
  if (isTechAiQuery(query)) return "technology";
  if (/俄乌|中东|战争|冲突|地缘|外交|制裁|军事/.test(text)) return "policy";
  if (/利率|通胀|汇率|债|金融|市场|经济/.test(text)) return "market";
  if (/政策|监管|合规|法案|关税/.test(text)) return "policy";
  return "market";
}

function buildInfluenceText(edgeType, detail) {
  if (edgeType === "shared_tag") {
    return `两条事件通过标签「${detail}」处于同一观察簇，需联合跟踪其传导链条。`;
  }
  if (edgeType === "same_category") {
    return `同属「${detail}」维度，市场叙事与政策口径可能相互强化。`;
  }
  if (edgeType === "impact_theme") {
    return `在「${IMPACT_LABELS[detail] || detail}」层面存在共振，${detail === "risk" ? "需警惕二阶连锁反应。" : "可能形成联动定价。"}`;
  }
  return `摘要/标题关键词重叠（${detail}），建议核对是否存在因果或共因关系。`;
}

function inferEdgeTone(edgeType, detail, a, b) {
  const text = `${detail} ${a.title} ${a.summary} ${b.title} ${b.summary} ${(a.tags || []).join(" ")} ${(b.tags || []).join(" ")}`;
  if (edgeType === "impact_theme" && detail === "risk") return "negative";
  if (/风险|冲突|限制|制裁|危机|违约|成本上行|承压|扰动|不确定/.test(text)) return "negative";
  if (/受益|机会|增长|投资|改善|弹性|获得|扩张|提振/.test(text)) return "positive";
  return "neutral";
}

function inferEdgeWeight(type, a, b, detail = "") {
  const severity = Math.round((Number(a.severity || 0) + Number(b.severity || 0)) / 2);
  const base = severity >= 90 ? 4 : severity >= 80 ? 3 : severity >= 70 ? 2 : 1;
  const bonus = type === "shared_tag" ? 1 : type === "impact_theme" ? 1 : 0;
  const detailBonus = String(detail).includes("重大") ? 1 : 0;
  return Math.max(1, Math.min(5, base + bonus + detailBonus));
}

function inferNodeDimension(event) {
  const corpus = `${event.title || ""} ${event.summary || ""}`.toLowerCase();
  if (/ukraine|russia|war briefing|gaza|nato|missile|ceasefire|俄乌|顿巴斯|克里米亚|军援|普京|zelenskyy/i.test(corpus)) {
    return "policy";
  }
  if (/\bai\b|artificial intelligence|machine learning|大模型|算力|芯片|llm|gpt|openai|anthropic|nvidia/i.test(corpus)) {
    return "technology";
  }
  const tones = (event.impacts || []).map(([tone]) => tone);
  if (tones.includes("risk") || event.tags?.some((tag) => /冲突|制裁|地缘|军事/.test(tag))) return "policy";
  if (tones.includes("market") || event.tags?.some((tag) => /利率|汇率|价格|供应链|能源|现金流/.test(tag))) return "market";
  if (tones.includes("policy") || event.tags?.some((tag) => /政策|监管|合规|重大/.test(tag))) return "policy";
  return "market";
}

function edgeDimension(type, detail, from, to) {
  if (type === "impact_theme" && DIMENSION_DEPTH[detail]) return detail;
  if (type === "shared_tag" && /冲突|制裁|地缘|军事/.test(detail)) return "policy";
  if (type === "shared_tag" && /AI|算力|芯片|大模型|gpt/i.test(detail)) return "technology";
  if (type === "shared_tag" && /利率|汇率|能源|供应链|价格/.test(detail)) return "market";
  if (type === "shared_tag" && /政策|监管|合规|重大/.test(detail)) return "policy";
  if (from.dimension === to.dimension) return from.dimension;
  return "market";
}

export async function listTags() {
  const store = await readEventStore();
  const counts = new Map();
  for (const event of store.events) {
    for (const tag of event.tags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  const tags = [...counts.entries()]
    .map(([name, eventCount]) => ({ name, eventCount }))
    .sort((a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name, "zh"));
  return { tags };
}

export async function buildGraph(selectedTags, options = {}) {
  const query = String(options.query || "").trim();
  const secondaryQuery = String(options.secondaryQuery || "").trim();
  const coreOnly = options.coreOnly !== false;
  if (!query) {
    return { error: "请至少输入事件主题" };
  }

  const intelResult = await enrichEventsFromIntel(query);

  const store = await readEventStore();
  const enrichedCandidates = store.events
    .filter((event) => matchesAnalysisQuery(event, query))
    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))
    .slice(0, 30);
  const mysqlSync = await upsertEventsToMysql(enrichedCandidates);
  const mysqlRecall = await recallEventsFromMysql(query, coreOnly ? 20 : 40);

  const sourceEvents = mysqlRecall.ok && mysqlRecall.events.length ? mysqlRecall.events : store.events;
  const now = Date.now();
  const { startTs } = resolveAnalysisWindow(query, now);
  const intelById = new Map(intelResult.events.map((event) => [event.id, event]));
  const allMatched = sourceEvents
    .filter((event) => {
      const occurredTs = new Date(event.occurredAt || 0).getTime();
      return Number.isFinite(occurredTs) && occurredTs >= startTs;
    })
    .filter((event) => {
      const tagMatched = selectedTags.length && event.tags.some((tag) => selectedTags.includes(tag));
      return tagMatched || matchesAnalysisQuery(event, query);
    });
  for (const event of intelResult.events) {
    if (!allMatched.some((item) => item.id === event.id)) allMatched.push(event);
  }
  allMatched.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  const withLevel = allMatched.map((event) => {
    const timelineText = (event.timeline || []).map((point) => point.text).join(" ");
    const corpus = `${event.title || ""} ${event.summary || ""} ${timelineText}`.toLowerCase();
    const techAnchor =
      isTechAiQuery(query) && /\bgpt\b|chatgpt|gpt-\d|openai|anthropic|claude|llm|大模型/i.test(corpus);
    const level = event.special || techAnchor || Number(event.severity || 0) >= 85
      ? "core"
      : Number(event.severity || 0) >= 72
        ? "important"
        : "context";
    return { ...event, level };
  });
  let chosenEvents = coreOnly ? withLevel.filter((event) => event.level === "core") : withLevel;
  if (!chosenEvents.length) {
    const lane = inferQueryLane(query);
    const topicOnly = (event) => matchesAnalysisQuery(event, query);
    let fallback = sourceEvents
      .filter((event) => {
        const occurredTs = new Date(event.occurredAt || 0).getTime();
        return Number.isFinite(occurredTs) && occurredTs >= startTs;
      })
      .map((event) => ({ ...event, dimension: inferNodeDimension(event) }))
      .filter((event) => (isTechAiQuery(query) ? topicOnly(event) : event.dimension === lane || topicOnly(event)))
      .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))
      .slice(0, coreOnly ? 6 : 10)
      .map((event) => ({
        ...event,
        level: event.special || Number(event.severity || 0) >= 85 ? "core" : "important"
      }));
    if (!fallback.length) {
      fallback = sourceEvents
        .filter((event) => {
          const occurredTs = new Date(event.occurredAt || 0).getTime();
          return Number.isFinite(occurredTs) && occurredTs >= startTs && topicOnly(event);
        })
        .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0))
        .slice(0, coreOnly ? 6 : 10)
        .map((event) => ({
          ...event,
          level: event.special || Number(event.severity || 0) >= 85 ? "core" : "important"
        }));
    }
    chosenEvents = fallback;
  }
  const matchMode = allMatched.length ? "direct" : "fallback";

  const nodes = chosenEvents
    .map((event) => {
      const dimension = inferNodeDimension(event);
      return {
      id: event.id,
      title: event.title,
      summary: event.summary,
      tags: event.tags,
      severity: event.severity,
      category: event.category,
      region: event.region,
      occurredAt: event.occurredAt,
      level: event.level,
      dimension,
      depth: DIMENSION_DEPTH[dimension] || 2,
      impacts: event.impacts
      };
    });

  const edges = [];
  const edgeKeys = new Set();

  function addEdge(from, to, type, label, influence, detail = "") {
    const a = from.id < to.id ? from.id : to.id;
    const b = from.id < to.id ? to.id : from.id;
    const key = `${a}|${b}|${type}|${label}`;
    if (edgeKeys.has(key) || a === b) return;
    edgeKeys.add(key);
    edges.push({
      from: a,
      to: b,
      type,
      label,
      tone: inferEdgeTone(type, detail, from, to),
      weight: inferEdgeWeight(type, from, to, detail),
      dimension: edgeDimension(type, detail, from, to),
      influence
    });
  }

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const tags = sharedTags(a, b, selectedTags);
      if (tags.length) {
        const tagLabel = tags.length <= 2 ? tags.join("、") : `${tags.slice(0, 2).join("、")}等`;
        addEdge(a, b, "shared_tag", tagLabel, buildInfluenceText("shared_tag", tags[0]), tags.join("、"));
      }
      if (a.category === b.category && a.category !== "未分类") {
        addEdge(a, b, "same_category", `同类：${a.category}`, buildInfluenceText("same_category", a.category), a.category);
      }

      const themesA = new Set((a.impacts || []).map(([tone]) => tone));
      const themesB = new Set((b.impacts || []).map(([tone]) => tone));
      for (const theme of themesA) {
        if (themesB.has(theme)) {
          addEdge(
            a,
            b,
            "impact_theme",
            `影响维度：${IMPACT_LABELS[theme] || theme}`,
            buildInfluenceText("impact_theme", theme),
            theme
          );
        }
      }

      const kwA = tokenize(`${a.title} ${a.summary}`);
      const kwB = tokenize(`${b.title} ${b.summary}`);
      const overlap = [...kwA].filter((k) => kwB.has(k)).slice(0, 3);
      if (overlap.length) {
        addEdge(
          a,
          b,
          "keyword_overlap",
          `关键词：${overlap.join("、")}`,
          buildInfluenceText("keyword_overlap", overlap.join("、")),
          overlap.join("、")
        );
      }

      if (secondaryQuery && (matchesQuery(a, secondaryQuery) || matchesQuery(b, secondaryQuery))) {
        addEdge(
          a,
          b,
          "cross_impact",
          `交叉影响：${secondaryQuery}`,
          `主事件与「${secondaryQuery}」在传导链条中存在耦合，建议联动监控。`,
          secondaryQuery
        );
      }
    }
  }

  const chronologyEvents = (allMatched.length ? allMatched : chosenEvents).filter((event) =>
    matchesAnalysisQuery(event, query)
  );
  const chronology = buildEventChronology(chronologyEvents, { query });
  const lineEvents = chronologyEvents.map((event) => {
    const merged = intelById.get(event.id) || event;
    const dimension = inferNodeDimension(merged);
    return { ...merged, dimension, level: merged.level || event.level };
  });
  const eventLines = buildEventLines(lineEvents, nodes, edges, { query, chronology, graphNodes: nodes });

  // 对象画像：把匹配到的真实资料/事件归纳成"看懂全貌"的一段介绍（LLM）
  const briefingItems = (allMatched.length ? allMatched : chosenEvents).map((e) => ({
    title: e.title,
    summary: e.summary,
    occurredAt: e.occurredAt
  }));
  const briefing = await buildObjectBriefing(query, briefingItems, {
    sourceCount: intelResult.intel?.articlesIngested || 0
  });

  const payload = {
    query,
    secondaryQuery,
    coreOnly,
    briefing,
    graphSource: "memory",
    matchMode,
    recallSource: mysqlRecall.ok && mysqlRecall.events.length ? "mysql" : "memory",
    recallCount: mysqlRecall.events.length,
    intel: intelResult.intel,
    chronology,
    eventLines,
    ingestion: {
      mysqlUpserted: mysqlSync.ok ? mysqlSync.upserted : 0,
      mysqlStatus: mysqlSync.status || "degraded"
    },
    tags: selectedTags,
    storyline: nodes
      .slice()
      .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime())
      .map((item) => ({
        id: item.id,
        occurredAt: item.occurredAt,
        level: item.level,
        title: item.title,
        severity: item.severity
      })),
    nodes,
    edges,
    totalNodes: nodes.length,
    totalEdges: edges.length,
    neo4j: { synced: false, reason: nodes.length ? "pending" : "no-nodes" }
  };

  if (nodes.length) {
    const saveResult = await saveNeo4jGraph(nodes, edges);
    if (saveResult.ok) {
      payload.graphSource = "neo4j";
      payload.neo4j = {
        synced: true,
        nodes: saveResult.nodes,
        edges: saveResult.edges,
        database: saveResult.database,
        databaseFallback: saveResult.databaseFallback,
        message: `已写入 Neo4j ${saveResult.nodes} 节点、${saveResult.edges} 关系`
      };
      const verify = await queryNeo4jGraph(query);
      if (verify.ok) {
        payload.neo4j.verified = verify.nodes.length > 0;
        payload.neo4j.recalledNodes = verify.nodes.length;
        payload.neo4j.recalledEdges = verify.edges.length;
      }
    } else {
      payload.neo4j = { synced: false, reason: saveResult.reason || "save-failed" };
    }
  }
  return payload;
}

export function resolveTags(searchParams, body) {
  const fromQuery = parseTagsParam(searchParams.get("tags"));
  const fromBody = Array.isArray(body?.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  return fromQuery.length ? fromQuery : fromBody;
}

export function resolveGraphInput(searchParams, body) {
  const bodyCoreOnly = body?.coreOnly;
  const queryCoreOnly = searchParams.get("coreOnly");
  return {
    tags: resolveTags(searchParams, body),
    query: String(searchParams.get("query") || body?.query || "").trim(),
    secondaryQuery: String(searchParams.get("secondaryQuery") || body?.secondaryQuery || "").trim(),
    coreOnly: queryCoreOnly ? queryCoreOnly !== "0" : bodyCoreOnly !== false
  };
}
