import {
  OPENROUTER_URL,
  resolveOpenRouterApiKey,
  resolveOpenRouterModel
} from "../../shared/openrouter.mjs";
import { readSystemConfigRaw } from "../uc-004-system-config/service.mjs";
import { englishInsightLine } from "./chinese-brief.mjs";
import { finalizePaperReport } from "./paper.mjs";
import { filterKeywords, isGenericFluff, isLowSignalBody } from "./quality.mjs";
const TIMEOUT_MS = 28000;
const MAX_INPUT_CHARS = 12000;

function trimForPrompt(text) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > MAX_INPUT_CHARS ? `${cleaned.slice(0, MAX_INPUT_CHARS)}…` : cleaned;
}

function parseJsonBlock(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeReport(parsed, meta) {
  if (!parsed || typeof parsed !== "object") return null;

  const line = (value, prefix, index) => {
    const text = String(value || "").trim();
    if (!text) return "";
    if (/[\u4e00-\u9fff]/.test(text)) return text;
    return englishInsightLine(text, index, []);
  };

  const summary = String(parsed.summary || parsed.abstract || parsed.oneSentence || "").trim();
  if (!summary || !/[\u4e00-\u9fff]/.test(summary) || isGenericFluff(summary)) return null;

  const fromLayers = Array.isArray(parsed.layers)
    ? parsed.layers
      .map((layer, index) => {
        if (!layer || typeof layer !== "object") return "";
        const title = String(layer.title || `要点${index + 1}`).trim();
        const insight = String(layer.insight || layer.content || "").trim();
        const evidence = Array.isArray(layer.evidence) ? layer.evidence.slice(0, 2).join("；") : "";
        return [insight ? `【${title}】${insight}` : "", evidence ? `依据：${evidence}` : ""].filter(Boolean).join("；");
      })
      .filter(Boolean)
    : [];

  const keyPoints = [
    ...(Array.isArray(parsed.keyPoints) ? parsed.keyPoints : []),
    ...fromLayers,
    ...(Array.isArray(parsed.trends) ? parsed.trends : [])
  ]
    .map((item, index) => line(item, "要点", index))
    .filter(Boolean)
    .slice(0, 8);

  const recommendations = [
    ...(Array.isArray(parsed.recommendations) ? parsed.recommendations : []),
    ...(Array.isArray(parsed.suggestions) ? parsed.suggestions : []),
    ...(Array.isArray(parsed.actions) ? parsed.actions : [])
  ]
    .map((item, index) => line(item, "建议", index))
    .filter(Boolean)
    .slice(0, 6);

  if (keyPoints.length < 1) return null;
  if (recommendations.length < 1) return null;

  const keywords = filterKeywords(
    Array.isArray(parsed.keywords) ? parsed.keywords.map((item) => String(item || "").trim()).filter(Boolean) : []
  );

  return finalizePaperReport(
    {
      sourceName: meta.sourceName,
      sourceType: meta.sourceType,
      warnings: [...(meta.warnings || []), "已通过 LLM 生成技术简报。"],
      stats: meta.stats || {},
      summary,
      keyPoints,
      recommendations,
      keywords
    },
    meta
  );
}

export async function summarizeWithLlm(text, meta = {}) {
  const cleaned = String(text || "").trim();
  if (isLowSignalBody(cleaned)) return null;

  let config;
  try {
    config = await readSystemConfigRaw();
  } catch {
    return null;
  }

  const apiKey = await resolveOpenRouterApiKey(config);
  if (!apiKey) return null;

  const model = resolveOpenRouterModel(config.llm?.model || "openai/gpt-4.1-mini");
  const prompt = [
    "你是面向资深工程师/研究员的阅读简报助手。请阅读资料，输出一份简短「技术 paper」式解读，帮助读者快速把握文章精髓。",
    "",
    "输出要求：",
    "1) 全部使用简体中文（摘要、要点、建议）；原文链接、产品名、API 名等专有名词可保留英文；",
    "2) 面向技术人员：写清问题背景、核心方法/机制、关键结论与边界；",
    "3) 禁止空话套话（如「揭示了该领域」「跨领域融合」「可持续发展」「推动行业标准」）；",
    "4) 摘要 2–4 句，信息密度高，可直接用于技术同步；",
    "5) 要点 3–6 条，每条格式「【主题】结论；依据：具体事实/数据/方法」；",
    "6) 建议 2–5 条，面向读者下一步行动（验证、复现、对照文档、跟踪指标、风险核查等），必须可执行；",
    "7) 仅返回 JSON，无 markdown。",
    "",
    "JSON 字段：",
    '{ "summary": string, "keyPoints": string[], "recommendations": string[], "keywords": string[] }',
    "",
    "资料正文：",
    trimForPrompt(text)
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Nexus Auto-Intel Reading Assistant"
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        messages: [
          { role: "system", content: "你只输出合法 JSON，简体中文，技术简报风格。" },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return normalizeReport(parseJsonBlock(content), meta);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
