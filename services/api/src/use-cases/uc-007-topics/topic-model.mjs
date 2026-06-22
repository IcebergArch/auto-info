import { nowIso, safeSlug } from "../../shared/utils.mjs";

/** 议题状态机：active 活跃追踪 / watching 关注待研判 / archived 归档 */
export const TOPIC_STATUSES = ["active", "watching", "archived"];

/** 认知类型：结论 / 逻辑 / 决策 */
export const KNOWLEDGE_KINDS = ["takeaways", "reasoning", "decisions"];

function normalizeNote(note, kind, index = 0) {
  const text = String(note?.text || "").trim();
  if (!text) return null;
  return {
    id: note?.id || `${kind}-${Date.now()}-${index}`,
    text,
    createdAt: note?.createdAt || nowIso(),
    sourceSignalIds: Array.isArray(note?.sourceSignalIds)
      ? note.sourceSignalIds.map(String).filter(Boolean)
      : []
  };
}

function normalizeKnowledge(input) {
  const knowledge = {};
  for (const kind of KNOWLEDGE_KINDS) {
    const list = Array.isArray(input?.[kind]) ? input[kind] : [];
    knowledge[kind] = list
      .map((note, i) => normalizeNote(note, kind, i))
      .filter(Boolean);
  }
  return knowledge;
}

/**
 * 规范化 Topic 实体。
 * id 由系统生成且不可变；用户输入只进 title/query/aliases。
 * 不复制 event 内容，仅以 signalRefs(id 引用) 关联，事实源仍是 event store。
 */
export function normalizeTopic(input = {}) {
  const title = String(input.title || "").trim() || "未命名议题";
  const status = TOPIC_STATUSES.includes(input.status) ? input.status : "active";
  return {
    id: input.id || `topic-${safeSlug(title)}-${Date.now().toString(36)}`,
    title,
    slug: input.slug || safeSlug(title),
    aliases: Array.isArray(input.aliases)
      ? [...new Set(input.aliases.map((a) => String(a).trim()).filter(Boolean))]
      : [],
    query: String(input.query || title).trim(),
    status,
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
    signalRefs: Array.isArray(input.signalRefs)
      ? [...new Set(input.signalRefs.map(String).filter(Boolean))]
      : [],
    pinnedSignalIds: Array.isArray(input.pinnedSignalIds)
      ? [...new Set(input.pinnedSignalIds.map(String).filter(Boolean))]
      : [],
    knowledge: normalizeKnowledge(input.knowledge),
    lastReviewedAt: input.lastReviewedAt || null,
    // 情报秘书呈报（LLM 生成，刷新/回溯时更新）；保留上次结果，避免无 key 时清空
    briefing: input.briefing || null
  };
}

/** 应用部分更新：仅允许用户可编辑字段，id/createdAt 不可变 */
export function applyTopicPatch(topic, patch = {}) {
  const next = { ...topic };
  if (typeof patch.title === "string" && patch.title.trim()) {
    next.title = patch.title.trim();
    next.slug = safeSlug(next.title);
  }
  if (typeof patch.query === "string" && patch.query.trim()) {
    next.query = patch.query.trim();
  }
  if (Array.isArray(patch.aliases)) {
    next.aliases = [...new Set(patch.aliases.map((a) => String(a).trim()).filter(Boolean))];
  }
  if (TOPIC_STATUSES.includes(patch.status)) {
    next.status = patch.status;
  }
  if (Array.isArray(patch.pinnedSignalIds)) {
    next.pinnedSignalIds = [...new Set(patch.pinnedSignalIds.map(String).filter(Boolean))];
  }
  return normalizeTopic(next);
}

/** 追加一条认知笔记，返回新 topic */
export function appendKnowledge(topic, kind, note) {
  if (!KNOWLEDGE_KINDS.includes(kind)) {
    return { error: `未知认知类型：${kind}` };
  }
  const normalized = normalizeNote(note, kind, topic.knowledge?.[kind]?.length || 0);
  if (!normalized) {
    return { error: "认知内容不能为空" };
  }
  const next = normalizeTopic(topic);
  next.knowledge[kind] = [...next.knowledge[kind], normalized];
  return { topic: next, note: normalized };
}
