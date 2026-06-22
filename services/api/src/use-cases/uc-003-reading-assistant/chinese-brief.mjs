/** 阅读简报中文化：源链接/标题可保留英文，摘要/要点/建议须为简体中文 */

export function cjkCount(text) {
  return (String(text || "").match(/[\u4e00-\u9fff]/g) || []).length;
}

export function isMostlyChinese(text) {
  const cjk = cjkCount(text);
  const latin = (String(text || "").match(/[A-Za-z]/g) || []).length;
  if (latin > 0 && cjk === 0) return false;
  if (latin === 0) return true;
  return cjk / Math.max(1, cjk + latin) >= 0.22;
}

export function lineHasChinese(text) {
  return cjkCount(text) >= 4 || /[\u4e00-\u9fff]{2,}/.test(String(text || ""));
}

const ENTITY_STOPWORDS = new Set([
  "the", "new", "how", "why", "what", "who", "when", "where", "with", "from", "into", "over", "under",
  "this", "that", "those", "these", "here", "there", "will", "can", "are", "was", "were", "has", "have",
  "had", "not", "but", "for", "and", "all", "its", "our", "your", "his", "her", "their", "about", "after",
  "before", "being", "been", "more", "most", "some", "such", "than", "then", "they", "them", "also", "just",
  "only", "very", "still", "even", "much", "many", "other", "another", "first", "last", "next", "back",
  "opinion", "report", "news", "exclusive", "graphic", "detail", "large", "firms", "professional", "writer",
  "technology", "international", "education", "federal", "national", "american", "african", "work", "now",
  "love", "cheap", "here", "those", "managers", "struggling", "predicting", "misplaced", "strengthening",
  "take", "future", "hands", "hand", "have", "has", "had", "into", "own", "we", "you", "they", "she", "he",
  "would", "could", "should", "must", "need", "make", "made", "does", "did", "doing", "going", "come",
  "years", "year", "time", "times", "world", "life", "way", "ways", "things", "thing", "people", "person",
  "today", "stocks", "stock", "forex", "lead", "seoul", "vietnam", "singapore", "powerbox", "ecdd",
  "bisinfotech", "geostratum", "intelligence", "llc", "inc", "corp", "ltd", "gmbh", "plc", "group",
  "cyber", "access", "federal", "review", "guide", "deployment", "market", "markets", "banking", "finance"
]);

const ORG_ENTITY_ZH = new Map([
  ["openai", "OpenAI"],
  ["anthropic", "Anthropic"],
  ["nvidia", "英伟达"],
  ["google", "谷歌"],
  ["microsoft", "微软"],
  ["amazon", "亚马逊"],
  ["apple", "苹果"],
  ["meta", "Meta"],
  ["dod", "美国国防部"],
  ["fed", "美联储"],
  ["ukraine", "乌克兰"],
  ["russia", "俄罗斯"],
  ["taiwan", "台湾"],
  ["bytedance", "字节跳动"],
  ["amd", "AMD"],
  ["stanford", "斯坦福"],
  ["mit", "MIT"],
  ["columbia", "哥伦比亚大学"],
  ["axios", "Axios"],
  ["fortune", "Fortune"],
  ["cnn", "CNN"]
]);

export function isGenericInsightPhrase(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  return (
    /值得跟踪/.test(value)
    || /呈上行|呈下行|出现新的市场反应/.test(value)
    || /^对象：/.test(value)
    || /^主体：/.test(value)
    || /^数据：\d+；对象：/.test(value)
    || /议题：/.test(value)
    || /；对象：|；主体：/.test(value)
    || /核心数据与措辞以原文为准/.test(value)
    || /相关报道[。；;]?$/.test(value)
    || /^[A-Za-z][A-Za-z0-9、&_.-]{1,28}相关报道/.test(value)
  );
}

function isReliableNamedEntity(raw) {
  const key = String(raw || "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (!key || ENTITY_STOPWORDS.has(key)) return false;
  if (ORG_ENTITY_ZH.has(key)) return true;
  if (cjkCount(raw) > 0) return true;
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(String(raw || "").trim())) return true;
  return key.length >= 8;
}

export function factualActionFromText(text) {
  const lower = String(text || "").toLowerCase();
  if (/deploy|deployment|release|launch|unveil|introduc|rollout/.test(lower)) return "发布或部署";
  if (/partner|deal|agreement|sign|collaborat/.test(lower)) return "达成合作";
  if (/raises?|funding|valuation|series [a-h]|ipo/.test(lower)) return "融资或估值变动";
  if (/invests?|spend|commit|allocate/.test(lower)) return "宣布投资";
  if (/layoff|cut\s+\d|fire\s+\d|job cuts?/.test(lower)) return "裁员或收缩";
  if (/probe|investigat|scrutin|subpoena/.test(lower)) return "遭调查或审查";
  if (/sanction|ban|restrict|blacklist|export control/.test(lower)) return "制裁或出口限制";
  if (/attack|strike|missile|bomb|offensive|invasion|war briefing/.test(lower)) return "冲突或军事行动";
  if (/ceasefire|peace talk|truce/.test(lower)) return "停火或和谈进展";
  if (/rate hike|rate cut|raises rates|cuts rates|interest rate/.test(lower)) return "利率政策调整";
  if (/inflation|cpi|ppi|price index/.test(lower)) return "通胀数据或预期";
  if (/warns?|caution|alert/.test(lower)) return "发出风险警示";
  if (/presentation|speech|address|remarks|testif/.test(lower)) return "公开发表演讲";
  if (/earnings|profit|revenue|outlook|forecast/.test(lower)) return "业绩或展望更新";
  if (/chip|semiconductor|gpu|foundry/.test(lower)) return "芯片产业链动态";
  if (/model|llm|gpt|claude|gemini/.test(lower)) return "大模型相关进展";
  if (/shipping|freight|red sea|houthi|suez/.test(lower)) return "航运与供应链扰动";
  if (/oil|gas|opec|energy price/.test(lower)) return "能源价格或供应";
  if (/regulat|compliance|antitrust|fine|penalt/.test(lower)) return "监管或处罚";
  if (/acquir|merger|takeover|buyout/.test(lower)) return "并购交易";
  if (/hack|breach|cyber|ransomware/.test(lower)) return "网络安全事件";
  if (/election|vote|ballot|parliament|congress|senate|legislation|\bact\b|clarity act/.test(lower)) {
    return "立法或监管议案";
  }
  if (/cooperation|partnership|bilateral|summit|poised to/.test(lower)) return "推进合作";
  if (/forex|currency|exchange rate/.test(lower)) return "外汇与汇率";
  return "";
}

function isMostlyEnglishDominant(text) {
  const cjk = cjkCount(text);
  const latin = (String(text || "").match(/[A-Za-z]/g) || []).length;
  return latin > 12 && cjk < 6;
}

export function extractNamedEntitiesFromEnglish(text, max = 3) {
  const tokens = String(text || "").match(/[A-Z][A-Za-z0-9&_.-]{2,}(?:\.[A-Z][A-Za-z]+)?/g) || [];
  const picked = [];
  const seen = new Set();
  for (const raw of tokens) {
    const key = raw.toLowerCase().replace(/\.$/, "");
    if (ENTITY_STOPWORDS.has(key) || seen.has(key)) continue;
    if (!isReliableNamedEntity(raw)) continue;
    seen.add(key);
    picked.push(ORG_ENTITY_ZH.get(key) || raw);
    if (picked.length >= max) break;
  }
  return picked;
}

function headlineCoreEnglish(title) {
  return String(title || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s*[-–—|]\s*/)[0]
    .replace(/^(opinion|exclusive|report|briefing):\s*/i, "")
    .trim();
}

export function buildFactualChineseTitle(title, categoryHint = "") {
  const keywords = categoryHint ? [categoryHint] : [];
  const factual = factualLineFromEnglish(title, keywords).replace(/。+$/, "").trim();
  if (factual && !isGenericInsightPhrase(factual) && cjkCount(factual) >= 4) {
    return factual.slice(0, 56);
  }
  const clip = translateHeadlineClip(title, 52);
  if (cjkCount(clip) >= 4 && !isMostlyEnglishDominant(clip)) return clip;
  const ents = extractNamedEntitiesFromEnglish(title, 3).filter(isReliableNamedEntity);
  const action = factualActionFromText(title);
  if (ents.length && action) return `${ents.join("、")}${action}`.slice(0, 56);
  if (ents.length && cjkCount(clip) >= 8) return clip;
  if (action) return `${categoryHint || "要闻"}：${action}`.slice(0, 56);
  if (cjkCount(clip) >= 10 && !isMostlyEnglishDominant(clip)) return clip;
  return categoryHint ? `${categoryHint}动态` : "要闻动态";
}

export function translateHeadlineClip(title, maxLen = 56) {
  let clip = headlineCoreEnglish(title);
  if (!clip) return "";
  for (const [key, zh] of ORG_ENTITY_ZH) {
    clip = clip.replace(new RegExp(`\\b${key}\\b`, "gi"), zh);
  }
  clip = clip
    .replace(/\bannounces?\b/gi, "宣布")
    .replace(/\blaunches?\b/gi, "发布")
    .replace(/\bwarns?\b/gi, "警告")
    .replace(/\braises?\b/gi, "融资")
    .replace(/\binvests?\b/gi, "投资")
    .replace(/\bdeploy(?:ment|s)?\b/gi, "部署")
    .replace(/\s+/g, " ")
    .trim();
  if (clip.length > maxLen) clip = `${clip.slice(0, maxLen - 1)}…`;
  return clip;
}

export function factualLineFromEnglish(sentence, keywords = []) {
  const raw = String(sentence || "").trim();
  if (!raw) return "";
  const action = factualActionFromText(raw);
  const entities = extractNamedEntitiesFromEnglish(raw, 3);
  const numbers =
    raw.match(/(?:\$|£|€)[\d.,]+\s*(?:billion|million|bn|m)?|\d+(?:\.\d+)?%/gi)?.slice(0, 2).join("、") || "";
  const parts = [];
  if (entities.length) parts.push(entities.join("、"));
  if (action) parts.push(action);
  if (numbers) parts.push(numbers);
  if (parts.length >= 2 || (entities.length && action)) {
    return `${parts.join("，")}。`.replace(/。+$/, "。");
  }
  const clip = translateHeadlineClip(raw, 72);
  if (lineHasChinese(clip) && cjkCount(clip) >= 4) return clip.endsWith("。") ? clip : `${clip}。`;
  const theme = keywords[0] || "";
  if (theme && entities.length) return `${entities.join("、")}：${headlineCoreEnglish(raw).slice(0, 42)}。`;
  return `${headlineCoreEnglish(raw).slice(0, 64)}。`;
}

export function englishInsightLine(sentence, index, keywords) {
  const lower = String(sentence || "").toLowerCase();
  const themes = [];
  if (/policy|regulat|government|law|compliance|restriction|export/.test(lower)) themes.push("政策监管");
  if (/market|stock|finance|econom|rate|inflation|bond|equity|bank/.test(lower)) themes.push("金融市场");
  if (/ai|chip|model|tech|data|software|compute|llm|api|semiconductor/.test(lower)) themes.push("技术产业");
  if (/risk|crisis|war|conflict|sanction|attack/.test(lower)) themes.push("风险");
  if (/supply|shipping|energy|power|oil|gas|logistics/.test(lower)) themes.push("供应链");
  const theme = themes[0] || keywords[index % Math.max(1, keywords.length)] || "";
  const body = factualLineFromEnglish(sentence, keywords).replace(/。+$/, "");
  if (!body || isGenericInsightPhrase(body)) {
    return factualLineFromEnglish(sentence, keywords);
  }
  return theme ? `【${theme}】${body}` : body;
}

export function buildChineseSummaryFromEnglish(sentences, keywords) {
  const ranked = sentences
    .map((sentence, index) => ({ sentence, index }))
    .filter((item) => item.sentence.length > 20)
    .slice(0, 6);
  const insights = ranked.map((item, index) => englishInsightLine(item.sentence, index, keywords));
  const theme = keywords.slice(0, 3).join("、") || "相关资料";
  if (insights.length >= 2) {
    return `本文围绕${theme}展开。${insights.slice(0, 3).join(" ")} 详细表述与数据请以原文链接为准。`;
  }
  if (insights.length === 1) {
    return `本文围绕${theme}展开。${insights[0]} 建议点击原文核对细节与边界条件。`;
  }
  return `已识别英文资料，主题线索：${theme}。请展开要点或点击原文链接查看完整表述。`;
}

export function localizeBriefLine(text, kind, index, keywords = []) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (lineHasChinese(raw) && !isMostlyEnglishDominant(raw)) return raw;
  if (kind === "summary" && raw.length > 30) {
    return buildChineseSummaryFromEnglish([raw], keywords);
  }
  return englishInsightLine(raw, index, keywords);
}

export function ensureChineseBriefFields(report, meta = {}) {
  const keywords = Array.isArray(report?.keywords) ? report.keywords : [];
  let summary = String(report?.summary || "").trim();
  let keyPoints = (Array.isArray(report?.keyPoints) ? report.keyPoints : []).map((item) => String(item || "").trim()).filter(Boolean);
  let recommendations = (Array.isArray(report?.recommendations) ? report.recommendations : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  if (!lineHasChinese(summary) || isMostlyEnglishDominant(summary)) {
    const sentences = summary.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 12);
    summary =
      sentences.length > 0
        ? buildChineseSummaryFromEnglish(sentences, keywords)
        : buildChineseSummaryFromEnglish([String(meta.rawBody || "").slice(0, 500)], keywords);
  }

  keyPoints = keyPoints.map((line, index) => localizeBriefLine(line, "point", index, keywords)).filter(Boolean);
  if (keyPoints.length < 2 && summary) {
    keyPoints.push(`【概要】${summary.split(/[。！？]/)[0] || summary}`.slice(0, 120));
  }

  recommendations = recommendations
    .map((line, index) => {
      const raw = String(line || "").trim();
      if (lineHasChinese(raw) && !isMostlyEnglishDominant(raw)) return raw;
      return "对照原文链接核对关键事实、数据口径与时间范围后再用于决策。";
    })
    .filter(Boolean);

  if (!recommendations.length) {
    recommendations.push("点击「查看原文」核对英文细节、图表与脚注，避免仅依据概要做结论。");
  }

  return { ...report, summary, keyPoints, recommendations };
}
