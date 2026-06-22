import { buildSummaryReport } from "./summary.mjs";
import { extractMeaningfulBody, isLowSignalBody, isPlaceholderOnlyBody } from "./quality.mjs";
import { classifyMediaUrl, fetchUrlText, parseYouTubeId } from "./source-fetch.mjs";
import {
  buildReadingAccessKey,
  getReadingSession,
  listReadingHistory,
  removeReadingSession,
  upsertReadingSession
} from "./reading-history.mjs";

function preview(text, len = 160) {
  const t = String(text || "").replace(/\s+/g, " ");
  return t.length <= len ? t : `${t.slice(0, len)}…`;
}

function chineseSessionTitle(report, sourceType, sourceName) {
  const summary = String(report?.summary || "").replace(/\s+/g, " ").trim();
  const firstClause = summary.split(/[。！？!?]/)[0]?.trim() || "";
  if (firstClause) {
    const cleaned = firstClause
      .replace(/^本资料围绕「?/, "")
      .replace(/」?展开.*$/, "")
      .replace(/^[：:]/, "")
      .trim();
    if (cleaned && /[\u4e00-\u9fff]/.test(cleaned)) return cleaned.slice(0, 18);
  }
  const sourceLabel = sourceType === "web"
    ? "网页阅读"
    : sourceType === "pdf"
      ? "PDF 阅读"
      : sourceType === "video"
        ? "视频阅读"
        : sourceType === "audio"
          ? "音频阅读"
          : sourceType === "file"
            ? "文档阅读"
            : "资料阅读";
  const fallback = String(sourceName || "").replace(/^https?:\/\//, "").split(/[/?#]/)[0] || "未命名来源";
  return `${sourceLabel}：${fallback}`.slice(0, 24);
}

function isYouTubeUrl(url) {
  const value = String(url || "").toLowerCase();
  return value.includes("youtube.com/") || value.includes("youtu.be/");
}

function mediaSourceLabel(kind) {
  return kind === "audio" ? "音频" : "视频";
}

function parseSmartInput(smartInput = "") {
  const lines = String(smartInput || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return {};

  const urls = [];
  const texts = [];
  const urlRegex = /https?:\/\/[^\s]+/gi;
  lines.forEach((line) => {
    const found = line.match(urlRegex) || [];
    if (found.length) {
      found.forEach((url) => urls.push(url.replace(/[),.;，。]+$/, "")));
      const removed = line.replace(urlRegex, "").trim();
      if (removed) texts.push(removed);
      return;
    }
    texts.push(line);
  });

  let webUrl = "";
  let pdfUrl = "";
  let videoUrl = "";
  let audioUrl = "";
  for (const url of urls) {
    if (!videoUrl && isYouTubeUrl(url)) {
      videoUrl = url;
      continue;
    }
    const media = classifyMediaUrl(url);
    if (media.kind === "video" && !videoUrl) {
      videoUrl = url;
      continue;
    }
    if (media.kind === "audio" && !audioUrl) {
      audioUrl = url;
      continue;
    }
    if (!pdfUrl && /\.pdf(?:$|[?#])/i.test(url)) {
      pdfUrl = url;
      continue;
    }
    if (!webUrl) webUrl = url;
  }

  const mergedText = texts.join("\n").trim();
  return {
    webUrl,
    pdfUrl,
    videoUrl,
    audioUrl,
    text: mergedText,
    transcript: ""
  };
}

async function appendMediaTextFromUrl({ url, kind, text, warnings }) {
  const media = classifyMediaUrl(url);
  const label = mediaSourceLabel(kind);
  if (!url) return { text, fetched: false, direct: false };
  if (media.direct) {
    warnings.push(`${label}直连文件无法在本地直接转写；请在链接下方粘贴字幕/转写后再生成简报。`);
    return { text, fetched: false, direct: true };
  }
  try {
    const fetched = await fetchUrlText(url);
    if (fetched.text?.trim()) {
      text = [text, fetched.text.trim()].filter(Boolean).join("\n\n");
    }
    warnings.push(...(fetched.warnings || []));
    warnings.push(`已尝试从${label}页面提取文字信息；若内容不完整，请补充字幕/转写。`);
    return { text, fetched: Boolean(fetched.text?.trim()), direct: false };
  } catch (error) {
    warnings.push(`${label}页面文字抓取失败：${error.message || "抓取失败"}。请粘贴字幕/转写。`);
    return { text, fetched: false, direct: false, error };
  }
}

export async function createSession(input) {
  if (input.smartInput && !input.webUrl && !input.pdfUrl && !input.videoUrl && !input.audioUrl && !input.text && !input.transcript) {
    const parsed = parseSmartInput(input.smartInput);
    input = {
      ...input,
      ...parsed
    };
  }

  const warnings = [];
  let text = String(input.text || "").trim();
  let sourceType = "text";
  let sourceName = input.title || "用户输入资料";
  let urlFetchFailed = false;
  let urlFetchError = "";

  if (input.webUrl) {
    try {
      const fetched = await fetchUrlText(input.webUrl);
      if (fetched.text?.trim()) {
        text = [text, fetched.text.trim()].filter(Boolean).join("\n\n");
      }
      sourceType = "web";
      sourceName = input.title || input.webUrl;
      warnings.push(...(fetched.warnings || []));
    } catch (error) {
      urlFetchFailed = true;
      urlFetchError = error.message || "抓取失败";
      warnings.push(`网页抓取失败：${urlFetchError}`);
    }
  }

  if (input.pdfUrl) {
    try {
      const fetched = await fetchUrlText(input.pdfUrl);
      if (fetched.text?.trim()) {
        text = [text, fetched.text.trim()].filter(Boolean).join("\n\n");
      }
      sourceType = "pdf";
      sourceName = input.title || input.pdfUrl;
      warnings.push(...(fetched.warnings || []));
    } catch (error) {
      urlFetchFailed = true;
      urlFetchError = error.message || "抓取失败";
      warnings.push(`PDF 链接抓取失败：${urlFetchError}`);
    }
  }

  if (input.videoUrl) {
    const videoId = parseYouTubeId(input.videoUrl);
    sourceType = "video";
    sourceName = input.title || (videoId ? `YouTube / ${videoId}` : input.videoUrl);
    if (input.transcript?.trim()) {
      text = [text, input.transcript.trim()].filter(Boolean).join("\n\n");
    } else if (!extractMeaningfulBody(text)) {
      const media = await appendMediaTextFromUrl({ url: input.videoUrl, kind: "video", text, warnings });
      text = media.text;
      if (!media.fetched && videoId) warnings.push(`已识别视频 ${videoId}，请在链接下方粘贴字幕/转写。`);
    }
  }

  if (input.audioUrl) {
    sourceType = "audio";
    sourceName = input.title || input.audioUrl;
    if (input.transcript?.trim()) {
      text = [text, input.transcript.trim()].filter(Boolean).join("\n\n");
    } else if (!extractMeaningfulBody(text)) {
      const media = await appendMediaTextFromUrl({ url: input.audioUrl, kind: "audio", text, warnings });
      text = media.text;
    }
  }

  if (input.fileText) {
    text = [text, String(input.fileText).trim()].filter(Boolean).join("\n\n");
    sourceType = "file";
    sourceName = input.fileName || sourceName;
  }

  const meaningful = extractMeaningfulBody(text);
  const hasUrl = Boolean(input.webUrl || input.pdfUrl || input.videoUrl || input.audioUrl);
  const hasMediaUrl = Boolean(input.videoUrl || input.audioUrl);

  if (meaningful.length < 40) {
    if (hasUrl && (urlFetchFailed || isPlaceholderOnlyBody(text))) {
      return {
        error: urlFetchFailed
          ? `无法抓取该链接正文（${urlFetchError}）。请在输入框粘贴「链接 + 空行 + 文章正文/字幕/转写」，或换一篇可公开访问的文章页。`
          : hasMediaUrl
            ? "音视频链接已识别，但未取得可总结的字幕/转写。请在链接下方粘贴字幕/转写，或提供带文字稿的公开页面。"
            : "链接已识别但正文过短。请在链接下方粘贴正文/字幕，或更换可抓取的文章链接。",
        warnings
      };
    }
    if (isLowSignalBody(text)) {
      return {
        error: hasMediaUrl
          ? "音视频链接需要字幕/转写才能可靠总结。请粘贴至少一段完整字幕/转写，或提供带文字稿的公开页面。"
          : "输入过短。请粘贴至少一段完整正文（建议 2–3 句以上），或提供可访问的文章/PDF 链接。",
        warnings
      };
    }
  }

  const bodyForSummary = meaningful.length >= 40 ? meaningful : text.trim();
  if (isLowSignalBody(bodyForSummary)) {
    return {
      error: "正文信息不足，无法生成技术简报。请补充完整段落或更长的摘录。",
      warnings
    };
  }

  const sources = {
    webUrl: input.webUrl || null,
    pdfUrl: input.pdfUrl || null,
    videoUrl: input.videoUrl || null,
    audioUrl: input.audioUrl || null
  };
  const sourceUrl = input.webUrl || input.pdfUrl || input.videoUrl || input.audioUrl || null;

  const report = await buildSummaryReport(bodyForSummary, {
    sourceName,
    sourceType,
    sourceUrl,
    sources,
    warnings
  });
  const title = input.title?.trim() || chineseSessionTitle(report, sourceType, sourceName);
  const accessKey = buildReadingAccessKey({
    webUrl: input.webUrl,
    pdfUrl: input.pdfUrl,
    videoUrl: input.videoUrl,
    audioUrl: input.audioUrl,
    text: bodyForSummary,
    smartInput: input.smartInput,
    title,
    sourceName
  });
  const sessionId = await upsertReadingSession({
    accessKey,
    title,
    sourceType,
    sourceName,
    sources,
    report
  });

  return { sessionId, report };
}

export async function listHistory(limit = 50) {
  return listReadingHistory(limit, preview);
}

export async function getSession(sessionId) {
  return getReadingSession(sessionId, { touch: true });
}

export async function deleteSession(sessionId) {
  return removeReadingSession(sessionId);
}
