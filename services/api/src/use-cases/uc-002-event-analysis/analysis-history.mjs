import { readAnalysisStore, writeAnalysisStore } from "../../shared/store.mjs";
import { nowIso, safeSlug } from "../../shared/utils.mjs";

function mainLaneYears(payload) {
  const points = payload.eventLines?.mainLane?.points || [];
  return [...new Set(
    points
      .map((point) => new Date(point.at).getUTCFullYear())
      .filter((year) => Number.isFinite(year))
  )].sort((a, b) => a - b);
}

function buildPreview(payload) {
  const nodes = payload.totalNodes || payload.nodes?.length || 0;
  const mainCount = payload.eventLines?.mainLane?.points?.length || 0;
  const years = mainLaneYears(payload);
  const yearSpan = years.length >= 2 ? `${years[0]}–${years[years.length - 1]}` : years[0] ? String(years[0]) : "";
  const range = payload.chronology?.timeRange || payload.eventLines?.timeRange;
  const start = range?.start?.slice(0, 10) || "";
  const end = range?.end?.slice(0, 10) || "";
  const rangeText = yearSpan || (start && end ? `${start.slice(0, 4)}→${end.slice(0, 4)}` : "");
  const parts = [
    rangeText ? `脉络 ${rangeText}` : "",
    mainCount ? `主轨 ${mainCount} 点` : "",
    nodes ? `${nodes} 节点` : ""
  ].filter(Boolean);
  return parts.join(" · ") || "分析结果";
}

/** 主事件相同且无 secondaryQuery 时视为同一会话；有 secondaryQuery 则独立（如 俄乌×欧洲） */
export function normalizeAnalysisKey(query, secondaryQuery) {
  const primary = String(query || "").trim().toLowerCase().replace(/\s+/g, "");
  const secondary = String(secondaryQuery || "").trim().toLowerCase().replace(/\s+/g, "");
  return secondary ? `${primary}::${secondary}` : primary;
}

export function sessionAnalysisKey(session) {
  return normalizeAnalysisKey(session.query, session.secondaryQuery);
}

export function buildStableSessionId(query, secondaryQuery) {
  const primarySlug = safeSlug(String(query || "").trim());
  const secondary = String(secondaryQuery || "").trim();
  if (!secondary) return `analysis-${primarySlug}`;
  return `analysis-${primarySlug}-${safeSlug(secondary)}`;
}

function sortSessions(sessions) {
  return sessions.slice().sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

function dedupeSessions(sessions) {
  const byKey = new Map();
  for (const session of sortSessions(sessions)) {
    const key = sessionAnalysisKey(session);
    if (!byKey.has(key)) byKey.set(key, session);
  }
  return sortSessions([...byKey.values()]);
}

export async function saveAnalysisResult(payload) {
  const key = normalizeAnalysisKey(payload.query, payload.secondaryQuery);
  const store = await readAnalysisStore();
  const now = nowIso();
  const existing = store.sessions.find((session) => sessionAnalysisKey(session) === key);

  let sessionId = existing?.sessionId || buildStableSessionId(payload.query, payload.secondaryQuery);
  if (
    !existing
    && store.sessions.some((session) => session.sessionId === sessionId && sessionAnalysisKey(session) !== key)
  ) {
    sessionId = `${sessionId}-${Date.now()}`;
  }

  const session = {
    sessionId,
    query: String(payload.query || "").trim(),
    secondaryQuery: String(payload.secondaryQuery || "").trim(),
    coreOnly: payload.coreOnly,
    preview: buildPreview(payload),
    result: payload,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  const rest = store.sessions.filter((item) => sessionAnalysisKey(item) !== key);
  store.sessions = dedupeSessions([session, ...rest]).slice(0, 100);
  await writeAnalysisStore(store);
  return sessionId;
}

export async function listAnalysisHistory(limit = 50) {
  const store = await readAnalysisStore();
  const items = dedupeSessions(store.sessions)
    .slice(0, limit)
    .map((session) => {
      const years = mainLaneYears(session.result || {});
      return {
        sessionId: session.sessionId,
        query: session.query,
        secondaryQuery: session.secondaryQuery || "",
        coreOnly: session.coreOnly,
        preview: session.preview,
        mainPointCount: session.result?.eventLines?.mainLane?.points?.length || 0,
        yearSpan: years.length >= 2 ? `${years[0]}–${years[years.length - 1]}` : years[0] ? String(years[0]) : "",
        createdAt: session.createdAt,
        updatedAt: session.updatedAt || session.createdAt
      };
    });
  return { items, total: items.length };
}

export async function getAnalysisSession(sessionId) {
  const store = await readAnalysisStore();
  return store.sessions.find((session) => session.sessionId === sessionId) || null;
}
