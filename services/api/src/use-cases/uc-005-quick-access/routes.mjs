import { handleEmbedProxy } from "./embed-proxy.mjs";

const PREFIX = "/api/v1/quick-access/embed/";

export async function handleQuickAccess(req, res, pathname, searchParams, method) {
  if (!pathname.startsWith(PREFIX)) return false;
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return true;
  }
  const handled = handleEmbedProxy(req, res, pathname, searchParams);
  if (!handled) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Invalid embed target");
  }
  return true;
}
