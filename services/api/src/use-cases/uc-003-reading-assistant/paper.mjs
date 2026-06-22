/** 技术简报：摘要 - 要点 - 建议 */

import { ensureChineseBriefFields, lineHasChinese } from "./chinese-brief.mjs";

const TECH_SIGNAL =
  /算法|架构|模型|API|框架|实现|性能|基准|参数|训练|推理|开源|协议|芯片|算力|数据集|实验|方法|对比|提升|降低|部署|漏洞|版本|模块|函数|接口|论文|研究|系统|工程|\d+%|v\d+\.|GPT|LLM|Transformer/i;

const METHOD_SIGNAL = /采用|通过|基于|使用|提出|设计|实现|验证|表明|证明|发现|显示|达到|优于|相比/i;

export function scoreTechnicalSentence(sentence) {
  const text = String(sentence || "");
  if (!text || text.length < 10) return 0;
  let score = 0;
  if (TECH_SIGNAL.test(text)) score += 3;
  if (METHOD_SIGNAL.test(text)) score += 1.5;
  if (/\d+(\.\d+)?%?/.test(text)) score += 2;
  if (/[A-Z][A-Za-z0-9_-]{2,}/.test(text)) score += 1;
  if (text.length > 28 && text.length < 200) score += 1;
  if (/揭示了该领域|跨领域融合|可持续发展|详实的数据/.test(text)) score -= 5;
  return score;
}

export function buildTechnicalSummary(sentences, keywords) {
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreTechnicalSentence(sentence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const top = ranked.slice(0, 3).sort((a, b) => a.index - b.index).map((item) => item.sentence);
  if (top.length >= 2) {
    return top.join(" ");
  }
  if (top.length === 1) {
    const theme = keywords.slice(0, 3).join("、") || "该资料";
    return `${top[0]}（主题线索：${theme}）。`;
  }
  return "";
}

export function formatTechnicalPoint(sentence, index, keywords) {
  const text = String(sentence || "").trim();
  const theme = keywords[index % Math.max(1, keywords.length)] || "核心";
  const numbers = text.match(/\d+(?:\.\d+)?%?/g)?.slice(0, 2).join("、") || "";
  const entities = text.match(/[A-Z][A-Za-z0-9_.-]{2,}/g)?.slice(0, 2).join("、") || "";
  const evidence = [numbers ? `数据：${numbers}` : "", entities ? `对象：${entities}` : ""].filter(Boolean).join("；");
  const body = text.length > 120 ? `${text.slice(0, 118)}…` : text;
  return evidence ? `【${theme}】${body}（${evidence}）` : `【${theme}】${body}`;
}

export function buildTechnicalKeyPoints(sentences, keywords, limit = 6) {
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreTechnicalSentence(sentence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const points = ranked.slice(0, limit).map((item, index) => formatTechnicalPoint(item.sentence, index, keywords));
  if (points.length >= 2) return points;
  if (sentences.length === 1) {
    const clauses = sentences[0]
      .split(/[，,；;]/)
      .map((part) => part.trim())
      .filter((part) => part.length > 10);
    if (clauses.length >= 2) {
      return clauses.slice(0, 5).map((part, index) => formatTechnicalPoint(part, index, keywords));
    }
  }
  return points;
}

export function buildTechnicalRecommendations(text, keywords, keyPoints) {
  const lower = String(text || "").toLowerCase();
  const recs = [];

  if (/论文|paper|arxiv|研究|实验|benchmark|数据集/.test(lower)) {
    recs.push("对照原文核对实验设置、数据集版本与基线方法，避免误读结论外推范围。");
  }
  if (/api|sdk|框架|开源|github|release|版本/.test(lower)) {
    recs.push("查阅官方文档与变更日志，确认 API/版本差异后再落地到现有工程。");
  }
  if (/政策|监管|出口|限制|合规|制裁/.test(lower)) {
    recs.push("跟踪监管原文、生效时间与适用范围，评估对供应链与合规流程的实际影响。");
  }
  if (/模型|训练|推理|算力|芯片|gpu/.test(lower)) {
    recs.push("记录硬件环境、模型规模与推理成本，评估是否满足生产 SLA 与预算约束。");
  }
  if (/\d+%|基准|性能|延迟|吞吐/.test(lower)) {
    recs.push("在相近硬件与数据分布下复现关键指标，避免直接套用不同环境的 benchmark 数字。");
  }

  if (keyPoints.length) {
    recs.push(`优先验证要点中的核心断言：${keyPoints[0].replace(/^【[^】]+】/, "").slice(0, 60)}…`);
  }

  const themes = keywords.slice(0, 3).join("、");
  if (themes) {
    recs.push(`建立「${themes}」观察清单：来源、时间、量化指标各至少一项，便于后续复盘。`);
  }

  recs.push("若用于决策，请保留原始链接/附件并标注阅读日期，便于团队二次核对。");

  return [...new Set(recs)].slice(0, 5);
}

export function finalizePaperReport(report, meta = {}) {
  const localized = ensureChineseBriefFields(
    {
      summary: String(report?.summary || "").trim(),
      keyPoints: (Array.isArray(report?.keyPoints) ? report.keyPoints : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 8),
      recommendations: (Array.isArray(report?.recommendations) ? report.recommendations : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
      keywords: Array.isArray(report?.keywords) ? report.keywords : []
    },
    meta
  );

  let recommendations = localized.recommendations || [];
  if (!recommendations.length && Array.isArray(report?.questions)) {
    recommendations = report.questions.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
  }
  if (!recommendations.length && Array.isArray(report?.risks)) {
    recommendations = report.risks
      .map((item) => `关注风险：${String(item || "").trim()}`)
      .filter((line) => line.length > 6)
      .slice(0, 4);
  }

  const summary = String(localized.summary || "").trim();
  const keyPoints = localized.keyPoints || [];

  const sourceUrl = meta.sourceUrl || report?.sourceUrl || null;

  return {
    sourceName: report?.sourceName || meta.sourceName || "用户输入资料",
    sourceType: report?.sourceType || meta.sourceType || "text",
    sourceUrl,
    sources: meta.sources || report?.sources || null,
    warnings: report?.warnings || meta.warnings || [],
    stats: report?.stats || meta.stats || {},
    quality: report?.quality,
    paper: {
      summary,
      keyPoints,
      recommendations
    },
    summary,
    keyPoints,
    recommendations,
    keywords: Array.isArray(report?.keywords) ? report.keywords : [],
    risks: [],
    questions: [],
    locale: lineHasChinese(summary) ? "zh-CN" : "zh-CN-pending"
  };
}
