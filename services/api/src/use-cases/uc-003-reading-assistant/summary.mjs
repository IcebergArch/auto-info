import {
  buildChineseSummaryFromEnglish,
  englishInsightLine,
  isMostlyChinese
} from "./chinese-brief.mjs";
import { summarizeWithLlm } from "./llm-summarize.mjs";
import {
  buildTechnicalKeyPoints,
  buildTechnicalRecommendations,
  buildTechnicalSummary,
  finalizePaperReport,
  formatTechnicalPoint,
  scoreTechnicalSentence
} from "./paper.mjs";
import {
  buildHonestLowQualityReport,
  evaluateReportQuality,
  filterKeywords,
  isLowSignalBody
} from "./quality.mjs";

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text) {
  const normalized = cleanText(text).replace(/\s+/g, " ");
  if (!normalized) return [];
  const matches = normalized.match(/[^。！？!?.\n]+[。！？!?\.]?/g) || [normalized];
  return matches.map((s) => s.trim()).filter((s) => s.length > 12).slice(0, 80);
}

const KEYWORD_ZH = {
  ai: "人工智能",
  chip: "芯片",
  semiconductor: "半导体",
  policy: "政策",
  regulation: "监管",
  market: "市场",
  finance: "金融",
  inflation: "通胀",
  rate: "利率",
  supply: "供应链",
  energy: "能源",
  risk: "风险",
  war: "冲突",
  sanction: "制裁",
  climate: "气候",
  data: "数据",
  model: "模型",
  training: "训练",
  export: "出口",
  api: "API",
  benchmark: "基准测试"
};
const EN_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "onto", "about", "across", "over", "under",
  "then", "than", "when", "where", "which", "while", "will", "would", "could", "should", "have", "has", "had",
  "were", "was", "are", "is", "been", "being", "their", "there", "your", "you", "our", "ours", "they", "them",
  "its", "it's", "his", "her", "hers", "him", "who", "whom", "what", "how", "why", "can", "may", "might", "not",
  "also", "more", "most", "such", "very", "just", "only", "than", "some", "many", "much", "each", "other", "new"
]);
const ZH_STOPWORDS = new Set([
  "我们", "你们", "他们", "这个", "那个", "这些", "那些", "以及", "因此", "但是", "如果", "因为", "所以", "可能",
  "已经", "进行", "相关", "目前", "其中", "通过", "对于", "需要", "可以", "一个", "一种", "没有", "不是", "问题",
  "方面", "情况", "内容", "信息", "页面", "网站", "系统", "平台", "用户", "功能", "数据", "结果", "影响", "分析"
]);

function extractKeywords(text) {
  const domainTerms = [
    "AI", "芯片", "算力", "出口", "限制", "央行", "利率", "通胀", "供应链", "能源", "航运", "政策", "监管",
    "金融", "信用", "风险", "气候", "农产品", "电力", "数据中心", "版权", "合规", "市场", "美元", "汇率",
    "API", "LLM", "Transformer", "benchmark", "开源"
  ];
  const lower = text.toLowerCase();
  const foundTerms = domainTerms.filter((term) => lower.includes(term.toLowerCase()));
  const englishTokens = (text.match(/[A-Za-z][A-Za-z0-9-]{2,}/g) || [])
    .map((word) => word.toLowerCase())
    .filter((word) => !EN_STOPWORDS.has(word))
    .filter((word) => word.length >= 3 && word.length <= 20);
  const chineseTokens = (text.match(/[\u4e00-\u9fff]{2,8}/g) || [])
    .map((word) => word.trim())
    .filter((word) => !ZH_STOPWORDS.has(word))
    .filter((word) => !/^[一二三四五六七八九十百千万]+$/.test(word))
    .filter((word) => word.length >= 2 && word.length <= 8);

  const counts = new Map();
  [...foundTerms, ...chineseTokens, ...englishTokens].forEach((word) => {
    const key = String(word || "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh"))
    .slice(0, 18)
    .map(([word]) => word);

  const rejectFragment = (word) => {
    const w = String(word || "").trim();
    if (w.length > 10) return false;
    if (/揭示了|指出|强调|资料通过|该领域/.test(w)) return false;
    return true;
  };

  if (isMostlyChinese(text)) {
    const chineseFirst = ranked
      .map((word) => KEYWORD_ZH[String(word).toLowerCase()] || word)
      .filter((word) => /[\u4e00-\u9fff]/.test(word) || word.length <= 6)
      .filter(rejectFragment);
    return filterKeywords([...new Set(chineseFirst)]);
  }

  const zh = new Set();
  for (const word of ranked) {
    const mapped = KEYWORD_ZH[String(word).toLowerCase()];
    if (mapped) zh.add(mapped);
  }
  for (const [en, cn] of Object.entries(KEYWORD_ZH)) {
    if (lower.includes(en)) zh.add(cn);
  }
  return filterKeywords([...zh]);
}

function buildRulePaper(cleaned, meta, sentences, keywords) {
  const scored = sentences
    .map((sentence, index) => ({ sentence, index, score: scoreTechnicalSentence(sentence) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const summary = isMostlyChinese(cleaned)
    ? buildTechnicalSummary(sentences, keywords)
    : buildChineseSummaryFromEnglish(sentences, keywords);
  const keyPoints = isMostlyChinese(cleaned)
    ? buildTechnicalKeyPoints(sentences, keywords)
    : scored.slice(0, 6).map((item, index) => englishInsightLine(item.sentence, index, keywords));

  const recommendations = buildTechnicalRecommendations(cleaned, keywords, keyPoints);

  return finalizePaperReport(
    {
      sourceName: meta.sourceName,
      sourceType: meta.sourceType,
      warnings: meta.warnings || [],
      stats: meta.stats,
      summary: summary || (keyPoints[0] ? keyPoints[0].replace(/^【[^】]+】/, "") : "资料较短，建议补充完整正文。"),
      keyPoints: keyPoints.length ? keyPoints : ["未能从正文提取足够技术要点，请粘贴更完整内容。"],
      recommendations,
      keywords: filterKeywords(keywords)
    },
    meta
  );
}

function applyQualityGate(report, meta = {}) {
  const quality = evaluateReportQuality(report);
  if (quality.passed) {
    return finalizePaperReport(
      {
        ...report,
        keywords: quality.keywords?.length ? quality.keywords : filterKeywords(report.keywords),
        quality: { passed: true }
      },
      meta
    );
  }
  const honest = buildHonestLowQualityReport(meta, "fluff");
  honest.warnings = [...(report.warnings || []), ...honest.warnings];
  return { ...finalizePaperReport(honest, meta), quality: { passed: false, reason: quality.reason } };
}

export async function buildSummaryReport(text, meta = {}) {
  const cleaned = cleanText(text);
  if (isLowSignalBody(cleaned)) {
    return finalizePaperReport(buildHonestLowQualityReport(meta, "insufficient"), meta);
  }

  const sentences = splitSentences(cleaned);
  const keywords = extractKeywords(cleaned);
  const stats = {
    characters: cleaned.length,
    sentences: sentences.length,
    keywords: keywords.length
  };
  const baseMeta = { ...meta, stats };

  const llmReport = await summarizeWithLlm(cleaned, baseMeta);
  if (llmReport) return applyQualityGate(llmReport, baseMeta);

  const rulePaper = buildRulePaper(cleaned, { ...baseMeta, rawBody: cleaned }, sentences, keywords);
  if (!isMostlyChinese(cleaned)) {
    rulePaper.warnings = [...(rulePaper.warnings || []), "原文为外文，简报已转为简体中文；专有名词与数据细节请通过原文链接核对。"];
  } else {
    rulePaper.warnings = [...(rulePaper.warnings || []), "未配置 LLM，已用规则引擎生成技术简报。"];
  }
  return applyQualityGate(rulePaper, baseMeta);
}
