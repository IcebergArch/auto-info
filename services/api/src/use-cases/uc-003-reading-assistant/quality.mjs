/** 阅读助手摘要质量：空话检测、关键词过滤、输入有效性、技术简报结构 */

import { scoreTechnicalSentence } from "./paper.mjs";

export const GENERIC_FLUFF_PATTERNS = [
  /揭示了该领域的核心驱动因素/,
  /详实的数据和案例/,
  /跨领域融合与智能化应用/,
  /整体竞争力和可持续发展能力/,
  /数据支持的实证分析验证了理论模型/,
  /推动了行业标准的制定/,
  /技术创新与市场需求的紧密结合/,
  /作用路径/,
  /未来发展应聚焦于/,
  /本资料围绕「.*」展开/,
  /系统已将其中的.*条核心论述转化为中文要点/,
  /建议结合原始链接核对关键事实/,
  /具备参考价值/,
  /出现新的变化信号/
];

const KEYWORD_BAD = /^(资料|本文|研究|该领域|通过|首先|最终|系统|用户输入|网页来源|视频来源)/;
const KEYWORD_FRAGMENT = /揭示了|指出|强调|提出|围绕|展开|首先|其次|最后|总结/;

export function isGenericFluff(text) {
  const t = String(text || "").trim();
  if (!t) return false;
  const hits = GENERIC_FLUFF_PATTERNS.filter((p) => p.test(t)).length;
  if (hits >= 2) return true;
  if (hits >= 1 && t.length < 160) return true;
  return false;
}

/** 去掉来源占位行与 URL，得到可用于摘要的正文 */
export function extractMeaningfulBody(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(网页来源|PDF 来源|视频来源|用户输入片段)[:：]/i.test(line));
  const joined = lines.join("\n");
  return joined
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPlaceholderOnlyBody(text) {
  const raw = String(text || "").trim();
  if (!raw) return true;
  const meaningful = extractMeaningfulBody(raw);
  if (meaningful.length >= 40) return false;
  return /^(网页来源|PDF 来源|视频来源|用户输入片段)[:：]/m.test(raw);
}

export function isLowSignalBody(text) {
  if (isPlaceholderOnlyBody(text)) return true;
  const meaningful = extractMeaningfulBody(text);
  if (/^(智能输入测试|English policy brief)$/i.test(meaningful)) return true;
  if (meaningful.length < 24) return true;
  const sentences = meaningful.split(/[。！？!?.\n]/).filter((s) => s.trim().length > 6);
  if (sentences.length === 0 && meaningful.length < 60) return true;
  return false;
}

export function filterKeywords(rawKeywords) {
  const list = Array.isArray(rawKeywords) ? rawKeywords : [];
  return list
    .map((w) => String(w || "").trim())
    .filter((w) => w.length >= 2 && w.length <= 12)
    .filter((w) => !KEYWORD_BAD.test(w))
    .filter((w) => !KEYWORD_FRAGMENT.test(w))
    .filter((w) => !isGenericFluff(w))
    .filter((w, i, arr) => arr.indexOf(w) === i)
    .slice(0, 10);
}

export function evaluateReportQuality(report) {
  const summary = String(report?.summary || "");
  const keyPoints = Array.isArray(report?.keyPoints) ? report.keyPoints : [];
  const recommendations = Array.isArray(report?.recommendations) ? report.recommendations : [];
  const keywords = filterKeywords(report?.keywords);

  if (isGenericFluff(summary)) {
    return { passed: false, reason: "summary_fluff" };
  }

  if (!/[\u4e00-\u9fff]/.test(summary)) {
    return { passed: false, reason: "summary_not_chinese" };
  }

  const nonChinesePoints = keyPoints.filter((line) => !/[\u4e00-\u9fff]/.test(String(line))).length;
  if (nonChinesePoints >= 1 && nonChinesePoints === keyPoints.length) {
    return { passed: false, reason: "keypoints_not_chinese" };
  }

  const genericPoints = keyPoints.filter((line) => isGenericFluff(String(line))).length;
  if (genericPoints >= 2 || (genericPoints >= 1 && keyPoints.length <= 2)) {
    return { passed: false, reason: "keypoints_fluff" };
  }

  if (keyPoints.length < 2) {
    return { passed: false, reason: "too_few_points" };
  }
  if (recommendations.length < 1) {
    return { passed: false, reason: "no_recommendations" };
  }

  const uniquePoints = new Set(keyPoints.map((l) => String(l).replace(/\s+/g, "").slice(0, 40)));
  if (uniquePoints.size < 2) {
    return { passed: false, reason: "duplicate_points" };
  }

  const techScore =
    scoreTechnicalSentence(summary)
    + keyPoints.reduce((sum, line) => sum + scoreTechnicalSentence(line), 0);
  if (techScore < 2 && summary.length < 40) {
    return { passed: false, reason: "low_technical_density" };
  }

  return { passed: true, keywords };
}

export function buildHonestLowQualityReport(meta, reason = "insufficient") {
  const warnings = [...(meta.warnings || [])];
  if (reason === "insufficient") {
    warnings.push("正文过短或未抓取到有效内容，无法生成可靠摘要。请粘贴完整正文、字幕，或可访问的网页链接。");
  } else if (reason === "fluff") {
    warnings.push("自动摘要未通过质量检查（空话/重复过多），已拒绝输出模板化结论。请补充更完整资料或配置 LLM 后重试。");
  }
  return {
    sourceName: meta.sourceName || "用户输入资料",
    sourceType: meta.sourceType || "text",
    warnings,
    stats: meta.stats || {},
    summary: "暂无法生成有效技术简报。",
    keyPoints: [
      "请提供至少 2–3 句完整正文，或粘贴可访问的网页/PDF 链接。",
      "仅输入标题或测试词无法产出有信息量的技术解读。"
    ],
    recommendations: [
      "粘贴完整正文或可用链接后重新执行。",
      "若为公司/产品文档，建议同时提供版本号与发布日期便于核对。",
      "配置 LLM API Key 后可获得更高质量的技术摘要与建议。"
    ],
    keywords: []
  };
}
