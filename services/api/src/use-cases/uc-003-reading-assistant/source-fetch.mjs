import { readSystemConfigRaw } from "../uc-004-system-config/service.mjs";

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePdfString(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

async function fetchTextWithTimeout(url, { timeoutMs = 15000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Nexus-Auto-Intel/1.0 (reading-assistant)", ...headers }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function extractPdfTextFromBuffer(buffer) {
  const raw = buffer.toString("latin1");
  const warnings = [];
  const chunks = [];
  const singleTextOps = raw.match(/\((?:\\.|[^\\()]){2,}\)\s*Tj/g) || [];
  singleTextOps.forEach((operation) => {
    const match = operation.match(/\(([\s\S]*)\)\s*Tj/);
    if (match) chunks.push(parsePdfString(match[1]));
  });
  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 80) {
    warnings.push("PDF 仅做基础文本抽取；扫描件或复杂排版需 OCR / 专业解析器。");
  }
  return { text, warnings };
}

export function parseYouTubeId(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.searchParams.get("v")) return url.searchParams.get("v");
    const parts = url.pathname.split("/").filter(Boolean);
    const shortsIndex = parts.indexOf("shorts");
    if (shortsIndex >= 0) return parts[shortsIndex + 1] || "";
    const embedIndex = parts.indexOf("embed");
    if (embedIndex >= 0) return parts[embedIndex + 1] || "";
  } catch {
    return "";
  }
  return "";
}

const AUDIO_EXT_RE = /\.(mp3|m4a|wav|aac|ogg|oga|flac|opus)(?:$|[?#])/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|avi|mkv|m3u8)(?:$|[?#])/i;

export function classifyMediaUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return { kind: "", direct: false, platform: "" };
  let host = "";
  let path = raw;
  try {
    const url = new URL(raw);
    host = url.hostname.toLowerCase().replace(/^www\./, "");
    path = `${url.pathname}${url.search}`;
  } catch {
    host = "";
  }

  if (AUDIO_EXT_RE.test(path)) return { kind: "audio", direct: true, platform: "file" };
  if (VIDEO_EXT_RE.test(path)) return { kind: "video", direct: true, platform: "file" };

  if (/youtube\.com|youtu\.be|bilibili\.com|vimeo\.com|tiktok\.com|twitch\.tv|douyin\.com/.test(host)) {
    return { kind: "video", direct: false, platform: host };
  }
  if (/spotify\.com|soundcloud\.com|podcasts\.apple\.com|podcast|anchor\.fm|ximalaya\.com/.test(host)) {
    return { kind: "audio", direct: false, platform: host };
  }
  return { kind: "", direct: false, platform: host };
}

export function isAudioVideoUrl(value) {
  return Boolean(classifyMediaUrl(value).kind);
}

function jinaReaderUrl(pageUrl) {
  const normalized = /^https?:\/\//i.test(pageUrl) ? pageUrl : `https://${pageUrl}`;
  return `https://r.jina.ai/${normalized}`;
}

export async function fetchUrlText(url, { timeoutMs = 15000, maxBytes = 2_000_000 } = {}) {
  const tryJinaReader = async () => {
    const config = await readSystemConfigRaw().catch(() => ({}));
    const jina = config.sources?.jinaReader || {};
    if (jina.enabled === false) return null;
    const target = jinaReaderUrl(url);
    const headers = { Accept: "text/plain" };
    if (jina.apiKey) headers.Authorization = `Bearer ${jina.apiKey}`;
    const markdown = await fetchTextWithTimeout(target, {
      timeoutMs: Math.max(timeoutMs, 18000),
      headers
    });
    const text = String(markdown || "")
      .replace(/^Title:.*$/m, "")
      .replace(/^URL Source:.*$/m, "")
      .replace(/^Markdown Content:\s*/m, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 80) return null;
    return { text, warnings: ["已使用 Jina Reader 提取正文。"], contentType: "web", via: "jina" };
  };

  const jinaExtracted = await tryJinaReader().catch(() => null);
  if (jinaExtracted) return jinaExtracted;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Nexus-Auto-Intel/1.0)" }
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error("响应体过大");
    }
    if (contentType.includes("pdf") || url.toLowerCase().includes(".pdf")) {
      const { text, warnings } = extractPdfTextFromBuffer(buffer);
      return { text, warnings, contentType: "pdf", via: "direct" };
    }
    const body = buffer.toString("utf-8");
    const text = contentType.includes("html") ? stripHtml(body) : body;
    return {
      text,
      warnings: text.length < 120 ? ["直连抓取正文较短，建议在链接后粘贴正文片段。"] : [],
      contentType: contentType.includes("html") ? "web" : "text",
      via: "direct"
    };
  } finally {
    clearTimeout(timer);
  }
}
