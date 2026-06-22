import { parseRequestBody, sendJson } from "../../shared/http.mjs";
import { getAnalysisSession, listAnalysisHistory, saveAnalysisResult } from "./analysis-history.mjs";
import { buildGraph, listTags, resolveGraphInput } from "./service.mjs";

const PREFIX = "/api/v1/analysis";

export async function handleEventAnalysis(req, res, pathname, searchParams, method) {
  if (method === "GET" && pathname === `${PREFIX}/tags`) {
    sendJson(res, 200, await listTags());
    return true;
  }

  if (method === "GET" && pathname === `${PREFIX}/history`) {
    const limit = Number(searchParams.get("limit") || 50);
    sendJson(res, 200, await listAnalysisHistory(limit));
    return true;
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/analysis\/sessions\/([^/]+)$/);
  if (sessionMatch && method === "GET") {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const session = await getAnalysisSession(sessionId);
    if (!session) {
      sendJson(res, 404, { error: "会话不存在" });
      return true;
    }
    sendJson(res, 200, session);
    return true;
  }

  if ((method === "GET" || method === "POST") && (pathname === `${PREFIX}/graph` || pathname === `${PREFIX}/analyze`)) {
    const body = method === "POST" ? await parseRequestBody(req) : {};
    const input = resolveGraphInput(searchParams, body);
    const result = await buildGraph(input.tags, {
      query: input.query,
      secondaryQuery: input.secondaryQuery,
      coreOnly: input.coreOnly
    });
    if (result.error) {
      sendJson(res, 400, result);
      return true;
    }
    const sessionId = await saveAnalysisResult(result);
    sendJson(res, 200, { ...result, sessionId });
    return true;
  }

  return false;
}
