import http from "node:http";
import https from "node:https";

const STRIP_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "x-content-security-policy"
]);

function isLocalHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export function parseEmbedTarget(pathname) {
  const prefix = "/api/v1/quick-access/embed/";
  if (!pathname.startsWith(prefix)) return null;
  const rest = pathname.slice(prefix.length);
  const slash = rest.indexOf("/");
  const hostPort = slash < 0 ? rest : rest.slice(0, slash);
  const targetPath = slash < 0 ? "/" : rest.slice(slash) || "/";
  if (!hostPort) return null;
  const colon = hostPort.lastIndexOf(":");
  if (colon < 1) return null;
  const hostname = hostPort.slice(0, colon);
  const port = Number(hostPort.slice(colon + 1));
  if (!isLocalHost(hostname) || !Number.isFinite(port) || port < 1 || port > 65535) return null;
  return { hostname, port, targetPath };
}

function rewriteHtmlBody(body, embedPrefix) {
  const prefix = embedPrefix.endsWith("/") ? embedPrefix : `${embedPrefix}/`;
  return body
    .replaceAll('href="/', `href="${prefix}`)
    .replaceAll("href='/", `href='${prefix}`)
    .replaceAll('src="/', `src="${prefix}`)
    .replaceAll("src='/", `src='${prefix}`)
    .replaceAll('"/db/', `"${prefix}db/`)
    .replaceAll("'/db/", `'${prefix}db/`)
    .replaceAll('"/browser/', `"${prefix}browser/`)
    .replaceAll("'/browser/", `'${prefix}browser/`);
}

export function handleEmbedProxy(req, res, pathname, searchParams) {
  const target = parseEmbedTarget(pathname);
  if (!target) return false;

  const query = searchParams.toString();
  const upstreamPath = `${target.targetPath}${query ? `?${query}` : ""}`;
  const embedPrefix = `/api/v1/quick-access/embed/${target.hostname}:${target.port}`;
  const lib = http;
  const headers = { ...req.headers };
  headers.host = `${target.hostname}:${target.port}`;
  delete headers["accept-encoding"];

  const options = {
    hostname: target.hostname,
    port: target.port,
    path: upstreamPath,
    method: req.method || "GET",
    headers
  };

  const proxyReq = lib.request(options, (proxyRes) => {
    const headers = {};
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      if (STRIP_HEADERS.has(key.toLowerCase())) continue;
      headers[key] = value;
    }

    const contentType = String(proxyRes.headers["content-type"] || "");
    const isHtml = contentType.includes("text/html");

    if (!isHtml) {
      res.writeHead(proxyRes.statusCode || 502, headers);
      proxyRes.pipe(res);
      return;
    }

    const chunks = [];
    proxyRes.on("data", (chunk) => chunks.push(chunk));
    proxyRes.on("end", () => {
      let body = Buffer.concat(chunks).toString("utf-8");
      body = rewriteHtmlBody(body, embedPrefix);
      const outHeaders = { ...headers };
      delete outHeaders["content-length"];
      outHeaders["content-length"] = Buffer.byteLength(body);
      res.writeHead(proxyRes.statusCode || 502, outHeaders);
      res.end(body);
    });
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`Embed proxy failed: ${error.message}`);
  });

  if (req.method !== "GET" && req.method !== "HEAD") {
    req.pipe(proxyReq);
  } else {
    proxyReq.end();
  }
  return true;
}

export function toEmbedPath(urlString) {
  try {
    const url = new URL(urlString);
    if (!isLocalHost(url.hostname)) return urlString;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    return `/api/v1/quick-access/embed/${url.hostname}:${port}${url.pathname || "/"}${url.search || ""}`;
  } catch {
    return urlString;
  }
}
