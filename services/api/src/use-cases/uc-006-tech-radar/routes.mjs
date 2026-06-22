import { parseRequestBody, sendJson } from "../../shared/http.mjs";
import {
  backfillTechRadarArchives,
  listTechRadarFeed,
  repairTechRadarArchives,
  upsertTechRadarEntry
} from "./service.mjs";

const PREFIX = "/api/v1/tech-radar";

export async function handleTechRadar(req, res, pathname, searchParams, method) {
  if (method === "GET" && pathname === `${PREFIX}/feed`) {
    sendJson(res, 200, await listTechRadarFeed(searchParams));
    return true;
  }

  if (method === "POST" && pathname === `${PREFIX}/entries`) {
    const body = await parseRequestBody(req);
    const result = await upsertTechRadarEntry(body);
    if (result.error) {
      sendJson(res, 422, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && pathname === `${PREFIX}/backfill`) {
    const body = await parseRequestBody(req);
    const result = await backfillTechRadarArchives(body);
    if (result.error) {
      sendJson(res, 422, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && pathname === `${PREFIX}/repair-archives`) {
    const body = await parseRequestBody(req);
    sendJson(res, 200, await repairTechRadarArchives(body));
    return true;
  }

  return false;
}
