import { parseRequestBody, sendJson } from "../../shared/http.mjs";
import {
  addKnowledge,
  backfillTopicSignals,
  createTopic,
  deleteTopic,
  getTopic,
  getTopicGraph,
  getTopicSignals,
  listTopics,
  refreshTopicSignals,
  updateTopic
} from "./service.mjs";
import { getAutoPullStatus, runAutoPullOnce } from "./scheduler.mjs";

const PREFIX = "/api/v1/topics";

export async function handleTopics(req, res, pathname, searchParams, method) {
  // 自动拉取状态/手动触发
  if (pathname === `${PREFIX}/auto-pull`) {
    if (method === "GET") {
      sendJson(res, 200, getAutoPullStatus());
      return true;
    }
    if (method === "POST") {
      const result = await runAutoPullOnce();
      sendJson(res, 200, result);
      return true;
    }
    return false;
  }

  // 集合：列表 / 创建
  if (pathname === PREFIX) {
    if (method === "GET") {
      sendJson(res, 200, await listTopics());
      return true;
    }
    if (method === "POST") {
      const body = await parseRequestBody(req);
      const result = await createTopic(body);
      sendJson(res, result.error ? 400 : 201, result);
      return true;
    }
    return false;
  }

  // 信号刷新：POST /topics/:id/refresh
  const refreshMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)\/refresh$/);
  if (refreshMatch && method === "POST") {
    const id = decodeURIComponent(refreshMatch[1]);
    const result = await refreshTopicSignals(id);
    if (result.notFound) {
      sendJson(res, 404, result);
      return true;
    }
    sendJson(res, result.error ? 400 : 200, result);
    return true;
  }

  // 回溯：POST /topics/:id/backfill（主动抓取近期+历史再匹配）
  const backfillMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)\/backfill$/);
  if (backfillMatch && method === "POST") {
    const id = decodeURIComponent(backfillMatch[1]);
    const result = await backfillTopicSignals(id);
    if (result.notFound) {
      sendJson(res, 404, result);
      return true;
    }
    sendJson(res, result.error ? 400 : 200, result);
    return true;
  }

  // 信号集：GET /topics/:id/signals
  const signalsMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)\/signals$/);
  if (signalsMatch && method === "GET") {
    const id = decodeURIComponent(signalsMatch[1]);
    const result = await getTopicSignals(id);
    if (result.notFound) {
      sendJson(res, 404, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  // 关系图：GET /topics/:id/graph
  const graphMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)\/graph$/);
  if (graphMatch && method === "GET") {
    const id = decodeURIComponent(graphMatch[1]);
    const result = await getTopicGraph(id);
    if (result.notFound) {
      sendJson(res, 404, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  // 认知追加：POST /topics/:id/knowledge
  const knowledgeMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)\/knowledge$/);
  if (knowledgeMatch && method === "POST") {
    const id = decodeURIComponent(knowledgeMatch[1]);
    const body = await parseRequestBody(req);
    const result = await addKnowledge(id, body.kind, { text: body.text, sourceSignalIds: body.sourceSignalIds });
    if (result.notFound) {
      sendJson(res, 404, result);
      return true;
    }
    sendJson(res, result.error ? 400 : 201, result);
    return true;
  }

  // 单实体：详情 / 更新 / 删除
  const idMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)$/);
  if (idMatch) {
    const id = decodeURIComponent(idMatch[1]);
    if (method === "GET") {
      const result = await getTopic(id);
      if (!result) {
        sendJson(res, 404, { error: "议题不存在" });
        return true;
      }
      sendJson(res, 200, result);
      return true;
    }
    if (method === "PATCH") {
      const body = await parseRequestBody(req);
      const result = await updateTopic(id, body);
      if (result.notFound) {
        sendJson(res, 404, result);
        return true;
      }
      sendJson(res, result.error ? 400 : 200, result);
      return true;
    }
    if (method === "DELETE") {
      const hard = searchParams.get("hard") === "1";
      const result = await deleteTopic(id, { hard });
      if (result.notFound) {
        sendJson(res, 404, result);
        return true;
      }
      sendJson(res, 200, result);
      return true;
    }
    return false;
  }

  return false;
}
