import { readReadingStore, writeReadingStore } from "../../shared/store.mjs";
import { nowIso, safeSlug } from "../../shared/utils.mjs";

const STRIP_QUERY = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid"
]);

export function normalizeReadingUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (STRIP_QUERY.has(key.toLowerCase())) parsed.searchParams.delete(key);
    }
    const normalized = parsed.toString().replace(/\/$/, "");
    return normalized.toLowerCase();
  } catch {
    return raw.toLowerCase().replace(/\/$/, "");
  }
}

function normalizeReadingText(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** 同一 URL 或实质相同正文视为同一会话 */
export function buildReadingAccessKey({ webUrl, pdfUrl, videoUrl, audioUrl, text, smartInput, title, sourceName }) {
  const url = normalizeReadingUrl(webUrl || pdfUrl || videoUrl || audioUrl);
  if (url) return `url:${url}`;

  const merged = normalizeReadingText(text || smartInput || "");
  if (merged.length >= 24) {
    return `text:${safeSlug(merged.slice(0, 160))}`;
  }

  const named = normalizeReadingText(title || sourceName || "");
  if (named.length >= 8) return `title:${safeSlug(named.slice(0, 80))}`;

  return `ephemeral:${Date.now()}`;
}

export function sessionReadingKey(session) {
  if (session.accessKey) return session.accessKey;
  const sources = session.sources || {};
  return buildReadingAccessKey({
    webUrl: sources.webUrl,
    pdfUrl: sources.pdfUrl,
    videoUrl: sources.videoUrl,
    audioUrl: sources.audioUrl,
    text: session.report?.summary,
    title: session.title,
    sourceName: session.sourceName
  });
}

export function buildStableReadingSessionId(accessKey) {
  const slug = safeSlug(accessKey.replace(/^url:|^text:|^title:/, ""));
  return `read-${slug || "session"}`.slice(0, 64);
}

function sortByRecent(sessions) {
  return sessions.slice().sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
}

export function dedupeReadingSessions(sessions) {
  const byKey = new Map();
  for (const session of sortByRecent(sessions)) {
    const key = sessionReadingKey(session);
    if (!byKey.has(key)) byKey.set(key, session);
  }
  return sortByRecent([...byKey.values()]);
}

export async function upsertReadingSession(payload) {
  const store = await readReadingStore();
  const now = nowIso();
  const accessKey = payload.accessKey;
  const key = accessKey || sessionReadingKey(payload);
  const existing = store.sessions.find((session) => sessionReadingKey(session) === key);

  let sessionId = existing?.sessionId || buildStableReadingSessionId(key);
  if (
    !existing
    && store.sessions.some((session) => session.sessionId === sessionId && sessionReadingKey(session) !== key)
  ) {
    sessionId = `${sessionId}-${Date.now()}`;
  }

  const session = {
    sessionId,
    accessKey: key,
    title: payload.title,
    sourceType: payload.sourceType,
    sourceName: payload.sourceName,
    sources: payload.sources,
    report: payload.report,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  const rest = store.sessions.filter((item) => sessionReadingKey(item) !== key);
  store.sessions = dedupeReadingSessions([session, ...rest]).slice(0, 200);
  await writeReadingStore(store);
  return sessionId;
}

export async function touchReadingSession(sessionId) {
  const store = await readReadingStore();
  const index = store.sessions.findIndex((session) => session.sessionId === sessionId);
  if (index < 0) return null;

  const session = {
    ...store.sessions[index],
    updatedAt: nowIso()
  };
  const rest = store.sessions.filter((item) => item.sessionId !== sessionId);
  store.sessions = [session, ...rest];
  await writeReadingStore(store);
  return session;
}

export async function listReadingHistory(limit = 50, previewFn) {
  const store = await readReadingStore();
  const items = dedupeReadingSessions(store.sessions)
    .slice(0, limit)
    .map((session) => ({
      sessionId: session.sessionId,
      title: session.title,
      sourceType: session.sourceType,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt || session.createdAt,
      summaryPreview: previewFn(session.report?.summary)
    }));
  return { items, total: items.length };
}

export async function getReadingSession(sessionId, { touch = true } = {}) {
  if (touch) {
    const touched = await touchReadingSession(sessionId);
    return touched;
  }
  const store = await readReadingStore();
  return store.sessions.find((session) => session.sessionId === sessionId) || null;
}

export async function removeReadingSession(sessionId) {
  const store = await readReadingStore();
  const before = store.sessions.length;
  store.sessions = store.sessions.filter((session) => session.sessionId !== sessionId);
  if (store.sessions.length === before) return false;
  await writeReadingStore(store);
  return true;
}
