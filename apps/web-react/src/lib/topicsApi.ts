import { fetchJson } from "./api";

export type TopicStatus = "active" | "watching" | "archived";
export type KnowledgeKind = "takeaways" | "reasoning" | "decisions";

export type KnowledgeNote = {
  id: string;
  text: string;
  createdAt: string;
  sourceSignalIds: string[];
};

export type TopicSummary = {
  id: string;
  title: string;
  slug: string;
  status: TopicStatus;
  signalCount: number;
  pinnedCount: number;
  knowledgeCount: number;
  lastReviewedAt: string | null;
  updatedAt: string;
};

export type TopicBriefing = {
  available: boolean;
  reason?: string;
  generatedAt?: string;
  recentCount?: number;
  historyCount?: number;
  verdict?: string;
  clusters?: Array<{ theme: string; gist: string }>;
  trend?: string;
  foresight?: string[];
  entryExit?: string[];
  cognitiveCheck?: string[];
  conclusion?: string;
  mermaid?: string;
};

export type Topic = {
  id: string;
  title: string;
  slug: string;
  aliases: string[];
  query: string;
  status: TopicStatus;
  createdAt: string;
  updatedAt: string;
  signalRefs: string[];
  pinnedSignalIds: string[];
  knowledge: Record<KnowledgeKind, KnowledgeNote[]>;
  lastReviewedAt: string | null;
  briefing?: TopicBriefing | null;
};

export type TopicSignal = {
  id: string;
  title: string;
  summary?: string;
  category?: string;
  region?: string;
  severity?: number;
  occurredAt?: string;
  time?: string;
  tags?: string[];
  references?: Array<{ url?: string; title?: string }>;
  pinned?: boolean;
};

const BASE = "/api/v1/topics";

export async function listTopics() {
  return fetchJson<{ topics: TopicSummary[]; total: number }>(BASE);
}

export async function getTopic(id: string) {
  return fetchJson<{ topic: Topic }>(`${BASE}/${encodeURIComponent(id)}`);
}

export type IntakeSummary = {
  created?: boolean;
  sourceCount?: number;
  matchCount?: number;
  error?: string;
};

export async function createTopic(input: { title: string; query?: string; aliases?: string[] }) {
  return fetchJson<{ topic: Topic; intake?: IntakeSummary }>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function updateTopic(
  id: string,
  patch: Partial<Pick<Topic, "title" | "query" | "aliases" | "status" | "pinnedSignalIds">>
) {
  return fetchJson<{ topic: Topic }>(`${BASE}/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export async function deleteTopic(id: string, hard = false) {
  return fetchJson<{ archived?: boolean; deleted?: boolean }>(
    `${BASE}/${encodeURIComponent(id)}${hard ? "?hard=1" : ""}`,
    { method: "DELETE" }
  );
}

export async function refreshTopicSignals(id: string) {
  return fetchJson<{ topic: Topic; matchedCount: number }>(
    `${BASE}/${encodeURIComponent(id)}/refresh`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export async function backfillTopicSignals(id: string) {
  return fetchJson<{ topic: Topic; matchedCount: number; intake?: IntakeSummary }>(
    `${BASE}/${encodeURIComponent(id)}/backfill`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

export async function getTopicSignals(id: string) {
  return fetchJson<{ topicId: string; total: number; signals: TopicSignal[] }>(
    `${BASE}/${encodeURIComponent(id)}/signals`
  );
}

export async function addKnowledge(id: string, kind: KnowledgeKind, text: string, sourceSignalIds?: string[]) {
  return fetchJson<{ topic: Topic; note: KnowledgeNote }>(
    `${BASE}/${encodeURIComponent(id)}/knowledge`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, text, sourceSignalIds })
    }
  );
}
