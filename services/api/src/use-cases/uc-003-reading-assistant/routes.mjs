import { parseRequestBody, sendJson } from "../../shared/http.mjs";
import { createSession, deleteSession, getSession, listHistory } from "./service.mjs";
import { extractPdfTextFromBuffer } from "./source-fetch.mjs";

const PREFIX = "/api/v1/reading-assistant";

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) return null;

  const boundaryMatch = contentType.match(/boundary=(.+)$/i);
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, "");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("latin1");
  const parts = raw.split(`--${boundary}`);

  const fields = {};
  for (const part of parts) {
    if (!part.includes("\r\n\r\n")) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    const headers = part.slice(0, headerEnd);
    const body = part.slice(headerEnd + 4).replace(/\r\n--$/, "").replace(/\r\n$/, "");
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (filenameMatch) {
      fields[name] = { filename: filenameMatch[1], data: Buffer.from(body, "latin1") };
    } else {
      fields[name] = body.trim();
    }
  }
  return fields;
}

export async function handleReadingAssistant(req, res, pathname, searchParams, method) {
  if (method === "POST" && pathname === `${PREFIX}/sessions`) {
    let body = {};
    const multipart = await parseMultipart(req);
    if (multipart) {
      body = {
        title: multipart.title,
        webUrl: multipart.webUrl,
        pdfUrl: multipart.pdfUrl,
        videoUrl: multipart.videoUrl,
        audioUrl: multipart.audioUrl,
        transcript: multipart.transcript,
        text: multipart.text
      };
      const file = multipart.file;
      if (file?.data) {
        const name = (file.filename || "").toLowerCase();
        if (name.endsWith(".pdf")) {
          const { text, warnings } = extractPdfTextFromBuffer(file.data);
          body.fileText = text;
          body.fileName = file.filename;
          body._warnings = warnings;
        } else {
          body.fileText = file.data.toString("utf-8");
          body.fileName = file.filename;
        }
      }
    } else {
      body = await parseRequestBody(req);
    }

    if (body._warnings?.length) {
      body.warnings = body._warnings;
    }

    const result = await createSession(body);
    if (result.error) {
      sendJson(res, 422, { error: result.error, warnings: result.warnings || [] });
      return true;
    }
    sendJson(res, 201, result);
    return true;
  }

  if (method === "GET" && pathname === `${PREFIX}/history`) {
    const limit = Number(searchParams.get("limit") || 50);
    sendJson(res, 200, await listHistory(limit));
    return true;
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/reading-assistant\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    if (method === "GET") {
      const session = await getSession(sessionId);
      if (!session) {
        sendJson(res, 404, { error: "会话不存在" });
        return true;
      }
      sendJson(res, 200, session);
      return true;
    }
    if (method === "DELETE") {
      const ok = await deleteSession(sessionId);
      if (!ok) {
        sendJson(res, 404, { error: "会话不存在" });
        return true;
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
  }

  return false;
}
