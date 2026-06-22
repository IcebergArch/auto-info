import { parseRange, parseRequestBody, sendJson } from "../../shared/http.mjs";
import {
  addFocusCategory,
  backfillDailyReports,
  removeFocusCategory,
  fillEventTimeline,
  deleteStoredReport,
  getDailyReport,
  getEventTimeline,
  listFocusCategories,
  listEvents,
  listHistory,
  listSearchHistory,
  listStoredReports,
  listTodayMajor,
  refreshTodayHeadlines,
  storeDailyReport,
  updateDailyReport,
  upsertEvents
} from "./service.mjs";
import { intakeEventQuery } from "./intake.mjs";

const PREFIX = "/api/v1/daily-events";
const LEGACY = "/api/auto-info";

export async function handleDailyEvents(req, res, pathname, searchParams, method) {
  if (method === "GET" && (pathname === `${PREFIX}/today` || pathname === `${LEGACY}/today`)) {
    sendJson(res, 200, await listTodayMajor(searchParams));
    return true;
  }

  if (method === "GET" && (pathname === `${PREFIX}/report` || pathname === `${LEGACY}/report`)) {
    const result = await getDailyReport(searchParams);
    if (result.error) {
      sendJson(res, 422, result);
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(`${JSON.stringify(result)}\n`);
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/report/store` || pathname === `${LEGACY}/report/store`)) {
    const body = await parseRequestBody(req);
    const result = await storeDailyReport(body);
    if (result.error) {
      sendJson(res, 422, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/report/update` || pathname === `${LEGACY}/report/update`)) {
    const body = await parseRequestBody(req);
    sendJson(res, 200, await updateDailyReport(body));
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/report/backfill` || pathname === `${LEGACY}/report/backfill`)) {
    const body = await parseRequestBody(req);
    const result = await backfillDailyReports(body);
    if (result.error) {
      sendJson(res, 422, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (method === "GET" && (pathname === `${PREFIX}/reports` || pathname === `${LEGACY}/reports`)) {
    sendJson(res, 200, await listStoredReports(searchParams));
    return true;
  }

  const reportDeleteMatch = pathname.match(/^\/api\/(?:v1\/daily-events|auto-info)\/reports\/([^/]+)$/);
  if (reportDeleteMatch && method === "DELETE") {
    const date = decodeURIComponent(reportDeleteMatch[1]);
    sendJson(res, 200, await deleteStoredReport(date));
    return true;
  }

  if (method === "GET" && (pathname === PREFIX || pathname === LEGACY)) {
    const { fromDate, toDate } = parseRange(searchParams);
    sendJson(res, 200, await listEvents(searchParams, fromDate, toDate));
    return true;
  }

  if (method === "GET" && (pathname === `${PREFIX}/history` || pathname === `${LEGACY}/history`)) {
    sendJson(res, 200, await listHistory(searchParams));
    return true;
  }

  if (method === "GET" && (pathname === `${PREFIX}/search-history` || pathname === `${LEGACY}/search-history`)) {
    sendJson(res, 200, await listSearchHistory(searchParams));
    return true;
  }

  if (method === "GET" && (pathname === `${PREFIX}/focus` || pathname === `${LEGACY}/focus`)) {
    sendJson(res, 200, await listFocusCategories());
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/focus` || pathname === `${LEGACY}/focus`)) {
    const body = await parseRequestBody(req);
    const result = await addFocusCategory(body);
    if (result.error) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/refresh` || pathname === `${LEGACY}/refresh`)) {
    sendJson(res, 200, await refreshTodayHeadlines());
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/intake` || pathname === `${LEGACY}/intake`)) {
    const body = await parseRequestBody(req);
    const result = await intakeEventQuery(body);
    if (result.error) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  const timelineMatch = pathname.match(/^\/api\/(?:v1\/daily-events|auto-info)\/events\/([^/]+)\/timeline$/);
  if (timelineMatch && method === "GET") {
    const eventId = decodeURIComponent(timelineMatch[1]);
    const result = await getEventTimeline(eventId, searchParams);
    if (!result) {
      sendJson(res, 404, { error: "事件不存在" });
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  const fillMatch = pathname.match(/^\/api\/(?:v1\/daily-events|auto-info)\/events\/([^/]+)\/timeline\/fill$/);
  if (fillMatch && method === "POST") {
    const eventId = decodeURIComponent(fillMatch[1]);
    const body = await parseRequestBody(req);
    const result = await fillEventTimeline(eventId, body);
    if (!result) {
      sendJson(res, 404, { error: "事件不存在" });
      return true;
    }
    if (result.error) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  const focusDeleteMatch = pathname.match(/^\/api\/(?:v1\/daily-events|auto-info)\/focus\/([^/]+)$/);
  if (focusDeleteMatch && method === "DELETE") {
    const name = decodeURIComponent(focusDeleteMatch[1]);
    const result = await removeFocusCategory(name);
    if (result.error) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  if (method === "POST" && (pathname === `${PREFIX}/events` || pathname === `${LEGACY}/events`)) {
    const body = await parseRequestBody(req);
    const result = await upsertEvents(body);
    if (result.error) {
      sendJson(res, 400, result);
      return true;
    }
    sendJson(res, 200, result);
    return true;
  }

  return false;
}
