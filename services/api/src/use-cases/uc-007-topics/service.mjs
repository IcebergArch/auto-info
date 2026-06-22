import { readTopicsStore, mutateTopicsStore } from "./topics-store.mjs";
import { appendKnowledge, applyTopicPatch, normalizeTopic } from "./topic-model.mjs";
import { readEventStore } from "../../shared/store.mjs";
import { nowIso } from "../../shared/utils.mjs";
import { matchSignalsForTopic } from "./signal-match.mjs";
import { buildGraph } from "../uc-002-event-analysis/service.mjs";
import { toPublicEvent } from "../../shared/event-model.mjs";
import { intakeEventQuery } from "../uc-001-daily-events/intake.mjs";
import { buildTopicBriefing } from "./topic-briefing.mjs";

/** 列出全部议题（轻量视图，不含完整 knowledge 正文，只给计数） */
export async function listTopics() {
  const store = await readTopicsStore();
  const topics = store.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    slug: topic.slug,
    status: topic.status,
    signalCount: topic.signalRefs.length,
    pinnedCount: topic.pinnedSignalIds.length,
    knowledgeCount:
      (topic.knowledge?.takeaways?.length || 0)
      + (topic.knowledge?.reasoning?.length || 0)
      + (topic.knowledge?.decisions?.length || 0),
    lastReviewedAt: topic.lastReviewedAt,
    updatedAt: topic.updatedAt
  }));
  return { topics, total: topics.length };
}

/** 议题详情（完整实体） */
export async function getTopic(id) {
  const store = await readTopicsStore();
  const topic = store.topics.find((t) => t.id === id);
  if (!topic) return null;
  return { topic };
}

/** 创建议题。创建后立即触发一次情报搜集（intake），让"发起议题"有实质反应。 */
export async function createTopic(body = {}) {
  const title = String(body.title || "").trim();
  if (!title) return { error: "议题标题不能为空" };
  const topic = normalizeTopic({
    title,
    query: body.query,
    aliases: body.aliases
  });
  const created = await mutateTopicsStore(async (store) => {
    store.topics.push(topic);
    return { store, value: { topic } };
  });

  // 触发情报搜集：用议题 query 走 intake（环境可联网时抓真实来源，
  // 否则兜底入库一条该议题观察条目），再匹配回议题 signalRefs。
  // skipArchive/skipHistory 避免污染日报与检索历史。
  let intakeSummary = null;
  try {
    const intake = await intakeEventQuery({
      query: topic.query,
      searchLatest: true,
      skipArchive: true,
      skipHistory: true
    });
    intakeSummary = {
      created: intake.created,
      sourceCount: intake.sourceSearch?.articles?.length || 0,
      matchCount: intake.totalMatches || 0
    };
  } catch (e) {
    intakeSummary = { error: e.message };
  }

  // 用最新事件库重新匹配议题信号
  const refreshed = await refreshTopicSignals(topic.id);
  const finalTopic = refreshed.topic || created.topic;
  return { topic: finalTopic, intake: intakeSummary };
}

/** 更新议题（部分字段，id/createdAt 不可变） */
export async function updateTopic(id, patch = {}) {
  return mutateTopicsStore(async (store) => {
    const index = store.topics.findIndex((t) => t.id === id);
    if (index === -1) return { store, value: { error: "议题不存在", notFound: true } };
    const updated = applyTopicPatch(store.topics[index], patch);
    store.topics[index] = updated;
    return { store, value: { topic: updated } };
  });
}

/** 删除/归档议题。hard=true 物理删除，否则置为 archived */
export async function deleteTopic(id, { hard = false } = {}) {
  return mutateTopicsStore(async (store) => {
    const index = store.topics.findIndex((t) => t.id === id);
    if (index === -1) return { store, value: { error: "议题不存在", notFound: true } };
    if (hard) {
      store.topics.splice(index, 1);
      return { store, value: { deleted: true, id } };
    }
    store.topics[index] = applyTopicPatch(store.topics[index], { status: "archived" });
    return { store, value: { archived: true, topic: store.topics[index] } };
  });
}

/**
 * 重新匹配议题信号，把命中事件 id 固化进 signalRefs（持久化），更新 lastReviewedAt。
 * 复用 matchSignalsForTopic（内部走 uc-002 匹配算法）。
 */
export async function refreshTopicSignals(id) {
  const store = await readTopicsStore();
  const topic = store.topics.find((t) => t.id === id);
  if (!topic) return { error: "议题不存在", notFound: true };

  const matched = await matchSignalsForTopic(topic);
  const matchedIds = matched.map((e) => e.id);

  // 生成情报秘书呈报（LLM）。失败/无 key 时保留上次 briefing，不清空。
  const signalsForBriefing = matched.map((e) => ({
    title: e.title,
    summary: e.summary,
    severity: e.severity,
    occurredAt: e.occurredAt
  }));
  const briefingResult = await buildTopicBriefing(topic, signalsForBriefing);
  const briefing = briefingResult.available ? briefingResult : (topic.briefing || briefingResult);

  return mutateTopicsStore(async (s) => {
    const index = s.topics.findIndex((t) => t.id === id);
    if (index === -1) return { store: s, value: { error: "议题不存在", notFound: true } };
    const updated = normalizeTopic({
      ...s.topics[index],
      signalRefs: matchedIds,
      lastReviewedAt: nowIso(),
      briefing
    });
    s.topics[index] = updated;
    return {
      store: s,
      value: { topic: updated, matchedCount: matchedIds.length }
    };
  });
}

/**
 * 回溯：主动抓取该议题的近期+历史资料（intake 真实检索），再重新匹配 signalRefs。
 * 与 refresh 的区别：refresh 只对现有 store 重新匹配；backfill 会先拉取新资料入库。
 * 旧种子/历史事件作为正式数据保留，新抓取增量合入。
 */
export async function backfillTopicSignals(id) {
  const store = await readTopicsStore();
  const topic = store.topics.find((t) => t.id === id);
  if (!topic) return { error: "议题不存在", notFound: true };

  let intakeSummary = null;
  try {
    const intake = await intakeEventQuery({
      query: topic.query,
      searchLatest: true,
      skipArchive: true,
      skipHistory: true
    });
    intakeSummary = {
      sourceCount: intake.sourceSearch?.articles?.length || 0,
      providerStatuses: intake.sourceSearch?.providerStatuses || [],
      matchCount: intake.totalMatches || 0
    };
  } catch (e) {
    intakeSummary = { error: e.message };
  }

  const refreshed = await refreshTopicSignals(id);
  return {
    topic: refreshed.topic,
    matchedCount: refreshed.matchedCount,
    intake: intakeSummary
  };
}

/** 议题的信号集（按 signalRefs 从 event store 取完整事件，公开格式，按冲击降序） */
export async function getTopicSignals(id) {
  const store = await readTopicsStore();
  const topic = store.topics.find((t) => t.id === id);
  if (!topic) return { error: "议题不存在", notFound: true };

  const eventStore = await readEventStore();
  const byId = new Map(eventStore.events.map((e) => [e.id, e]));
  const pinned = new Set(topic.pinnedSignalIds);
  const signals = topic.signalRefs
    .map((sid) => byId.get(sid))
    .filter(Boolean)
    .map((e, i) => ({ ...toPublicEvent(e, i), pinned: pinned.has(e.id) }))
    .sort((a, b) => Number(b.severity || 0) - Number(a.severity || 0));

  return { topicId: id, total: signals.length, signals };
}

/** 议题关系图：转调 uc-002 buildGraph(topic.query)，复用现有图算法不重写 */
export async function getTopicGraph(id) {
  const store = await readTopicsStore();
  const topic = store.topics.find((t) => t.id === id);
  if (!topic) return { error: "议题不存在", notFound: true };
  const graph = await buildGraph(topic.aliases || [], { query: topic.query });
  return { topicId: id, query: topic.query, ...graph };
}

/** 追加认知（结论/逻辑/决策） */
export async function addKnowledge(id, kind, note) {
  return mutateTopicsStore(async (store) => {
    const index = store.topics.findIndex((t) => t.id === id);
    if (index === -1) return { store, value: { error: "议题不存在", notFound: true } };
    const result = appendKnowledge(store.topics[index], kind, note);
    if (result.error) return { store, value: { error: result.error } };
    store.topics[index] = result.topic;
    return { store, value: { topic: result.topic, note: result.note } };
  });
}
