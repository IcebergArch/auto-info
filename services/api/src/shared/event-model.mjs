import {
  asNumber,
  dateKey,
  dedupeByAt,
  nowIso,
  safeSlug,
  toDateOrNull,
  toTimelineLabel
} from "./utils.mjs";

export function normalizeEvent(input, index = 0) {
  const occurredAt = toDateOrNull(input.occurredAt) || new Date(Date.now() - index * 3600 * 1000);
  const timeline = Array.isArray(input.timeline) ? input.timeline : [];
  const normalizedTimeline = timeline
    .map((point, pointIndex) => {
      const at = toDateOrNull(point.at) || new Date(occurredAt.getTime() - pointIndex * 24 * 3600 * 1000);
      return {
        id: point.id || `${safeSlug(input.id || input.title)}-tp-${pointIndex + 1}`,
        at: at.toISOString(),
        label: point.label || toTimelineLabel(at, occurredAt),
        text: String(point.text || ""),
        synthetic: Boolean(point.synthetic)
      };
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return {
    id: input.id || safeSlug(input.title),
    category: input.category || "未分类",
    region: input.region || "全球",
    title: String(input.title || "未命名事件"),
    summary: String(input.summary || ""),
    tags: Array.isArray(input.tags) ? input.tags : [],
    severity: Math.max(0, Math.min(100, asNumber(input.severity, 50))),
    special: Boolean(input.special),
    occurredAt: occurredAt.toISOString(),
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
    timeline: dedupeByAt(normalizedTimeline),
    impacts: Array.isArray(input.impacts) ? input.impacts : [],
    references: Array.isArray(input.references)
      ? input.references.map((ref, refIndex) => ({
        id: ref.id || `${safeSlug(input.id || input.title)}-ref-${refIndex + 1}`,
        title: String(ref.title || input.title || "参考来源"),
        source: String(ref.source || ref.provider || "external"),
        url: String(ref.url || ""),
        provider: String(ref.provider || ""),
        publishedAt: ref.publishedAt || input.occurredAt || nowIso(),
        accessedAt: ref.accessedAt || nowIso()
      }))
      : []
  };
}

export function toPublicEvent(event, rank = 0, baseDate = new Date()) {
  const sortedTimeline = [...event.timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const timeline = sortedTimeline.map((point) => [point.label || toTimelineLabel(point.at, baseDate), point.text]);
  const occurred = new Date(event.occurredAt);
  return {
    id: event.id,
    rank,
    category: event.category,
    region: event.region,
    time: `${occurred.toISOString().slice(0, 10)} ${occurred.toISOString().slice(11, 16)}`,
    title: event.title,
    summary: event.summary,
    tags: event.tags,
    severity: event.severity,
    special: event.special,
    occurredAt: event.occurredAt,
    timeline,
    impacts: event.impacts,
    references: Array.isArray(event.references) ? event.references : []
  };
}

export function fillTimelinePoints(event, fromDate, toDate) {
  const source = [...event.timeline].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (!fromDate || !toDate || fromDate > toDate) return source;

  const byDay = new Map(source.map((item) => [dateKey(new Date(item.at)), item]));
  const filled = [...source];
  const startDay = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  const endDay = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()));
  let steps = 0;

  for (let d = new Date(startDay); d <= endDay && steps < 90; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
    steps += 1;
    const k = dateKey(d);
    if (byDay.has(k)) continue;
    filled.push({
      id: `${event.id}-fill-${k}`,
      at: new Date(`${k}T12:00:00.000Z`).toISOString(),
      label: k,
      text: "该日期暂无新增原始事件，已根据区间回溯自动补齐观察位。",
      synthetic: true
    });
  }

  return dedupeByAt(filled).sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}
