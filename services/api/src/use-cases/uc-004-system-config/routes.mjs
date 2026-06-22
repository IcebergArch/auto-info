import { parseRequestBody, sendJson } from "../../shared/http.mjs";
import {
  getSystemConfig,
  getSystemStatus,
  syncSystemLinks,
  testLlmConnectivity,
  updateSystemConfig
} from "./service.mjs";

const PREFIX = "/api/v1/config";

export async function handleSystemConfig(req, res, pathname, searchParams, method) {
  if (method === "GET" && pathname === PREFIX) {
    sendJson(res, 200, await getSystemConfig());
    return true;
  }

  if (method === "PUT" && pathname === PREFIX) {
    const body = await parseRequestBody(req);
    sendJson(res, 200, await updateSystemConfig(body));
    return true;
  }

  if (method === "GET" && pathname === `${PREFIX}/status`) {
    sendJson(res, 200, await getSystemStatus());
    return true;
  }

  if (method === "POST" && pathname === `${PREFIX}/sync`) {
    sendJson(res, 200, await syncSystemLinks());
    return true;
  }

  if (method === "POST" && pathname === `${PREFIX}/llm/test`) {
    const body = await parseRequestBody(req);
    sendJson(res, 200, await testLlmConnectivity(body));
    return true;
  }

  return false;
}
