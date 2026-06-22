/** 日报/关键事件展示：英文标题保留原文；中文 displayTitle 点明「关于什么」；摘要为可扫读事实 */

import {
  buildChineseSummaryFromEnglish,
  cjkCount,
  buildFactualChineseTitle,
  factualActionFromText,
  factualLineFromEnglish,
  isGenericInsightPhrase,
  lineHasChinese,
  translateHeadlineClip
} from "../uc-003-reading-assistant/chinese-brief.mjs";
import {
  composeDecisionOverview,
  decisionDisplayTitle,
  isWeakTimelineCopy,
  stripDetailJumpSuffix,
  timelineDecisionScore
} from "./event-decision-copy.mjs";

const ORG_ZH = new Map([
  ["danmarks nationalbank", "丹麦央行"],
  ["federal reserve", "美联储"],
  ["european central bank", "欧洲央行"],
  ["international energy agency", "国际能源署"],
  ["department of energy", "美国能源部"],
  ["national security agency", "美国国家安全局"],
  ["the new york times", "纽约时报"],
  ["the wall street journal", "华尔街日报"],
  ["the guardian", "卫报"],
  ["reuters", "路透社"],
  ["time magazine", "时代周刊"],
  ["chatham house", "查塔姆研究所"],
  ["anthropic", "Anthropic"]
]);

const COMPANY_ZH = new Map([
  ["amazon", "亚马逊"],
  ["samsung electronics", "三星电子"],
  ["sk hynix", "SK 海力士"],
  ["google", "谷歌"],
  ["microsoft", "微软"],
  ["apple", "苹果"],
  ["meta", "Meta"],
  ["nvidia", "英伟达"]
]);

const CATEGORY_HINT = {
  金融: "金融",
  宏观: "宏观",
  地缘: "地缘",
  科技: "科技",
  政策: "政策",
  能源: "能源",
  产业: "产业",
  气候: "气候",
  未分类: "要闻"
};

const DIRECTION_LABELS = ["国际局势", "全球", "国内", "金融", "科技", "其他"];

export function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function normalizeNewsText(text) {
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

export function stripDuplicateSourceSuffix(title) {
  const normalized = normalizeNewsText(title);
  const doubleSpace = normalized.match(/^(.{12,}?)\s{2,}(.{2,80})$/);
  if (doubleSpace) {
    const tail = doubleSpace[2].toLowerCase();
    if (ORG_ZH.has(tail) || /reuters|substack|\.gov|\.com|news|magazine/i.test(doubleSpace[2])) {
      return doubleSpace[1].trim();
    }
  }
  return normalized;
}

export function isEnglishDominant(text) {
  const cjk = (String(text || "").match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (String(text || "").match(/[A-Za-z]/g) || []).length;
  return latin > 10 && cjk < 8;
}

export function summaryEchoesTitle(title, summary) {
  const t = normalizeNewsText(title).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  const s = normalizeNewsText(summary).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
  if (!t || !s) return false;
  const head = t.slice(0, Math.min(48, t.length));
  return s.includes(head) || head.includes(s.slice(0, 48));
}

/** 去掉方向标签/类目标签重复前缀，避免概要区「国际局势 国际局势：」 */
export function stripLeadingLabel(text, labels = DIRECTION_LABELS) {
  let value = normalizeNewsText(text);
  if (!value) return "";
  for (const label of labels) {
    if (!label) continue;
    if (value.startsWith(`${label}：`)) value = value.slice(label.length + 1).trim();
    if (value.startsWith(`【${label}】`)) value = value.slice(label.length + 2).trim();
  }
  value = value.replace(/^【[^】]{2,14}】\s*/, "").trim();
  return value;
}

function translateRoles(text) {
  return String(text || "")
    .replace(/\bassistant governor\b/gi, "助理行长")
    .replace(/\bexecutive director\b/gi, "执行董事")
    .replace(/\bgovernor\b/gi, "行长")
    .replace(/\bchief executive officer\b/gi, "首席执行官")
    .replace(/\bceo\b/gi, "首席执行官")
    .replace(/\bpresident\b/gi, "总统")
    .replace(/\bminister\b/gi, "部长")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function translateVenue(text) {
  return String(text || "")
    .replace(/^the\s+/i, "")
    .replace(/\binnovation summit\b/gi, "创新峰会")
    .replace(/\bsummit\b/gi, "峰会")
    .replace(/\bconference\b/gi, "会议")
    .replace(/\s+/g, " ")
    .trim();
}

function orgChinese(name) {
  const key = String(name || "").trim().toLowerCase();
  return ORG_ZH.get(key) || "";
}

function titleKeywords(title, category) {
  const lower = String(title || "").toLowerCase();
  const words = [];
  if (/ai|artificial intelligence|llm|chip|model/.test(lower)) words.push("人工智能");
  if (/war|conflict|ukraine|russia|sanction|missile|houthi|red sea|shipping/.test(lower)) words.push("地缘与航运");
  if (/rate|inflation|bank|finance|market|monetary/.test(lower)) words.push("金融市场");
  if (/energy|oil|gas|power|iea|birol/.test(lower)) words.push("能源");
  if (category && category !== "未分类") words.push(category);
  return words.length ? words : ["国际资讯"];
}

function shortWesternName(whoEn) {
  const tail = String(whoEn || "").split(/,/).pop()?.trim() || String(whoEn || "");
  const match = tail.match(/\b([A-Z][a-z]+)\s+([A-Z][a-z]+)\b/);
  if (match) return match[2];
  const single = tail.match(/\b([A-Z][a-z]{2,})\b/);
  if (single) return single[1];
  const parts = translateRoles(whoEn).split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || "";
}

function splitTitleParts(title) {
  const normalized = stripDuplicateSourceSuffix(title);
  const dash = normalized.match(/^(.+?)\s[-–—|]\s*(.+)$/);
  return {
    head: dash ? dash[1].trim() : normalized,
    tailOrg: dash ? dash[2].trim() : ""
  };
}

function parsePresentationMeta(title) {
  const { head, tailOrg } = splitTitleParts(title);
  const pres = head.match(/^(.*?)(?:'s|’s)?\s+(presentation|speech|address|remarks)\s+(?:at|on|during)\s+(.+)$/i);
  if (!pres) return null;
  return {
    who: pres[1].trim(),
    whoShort: shortWesternName(pres[1]),
    venue: translateVenue(pres[3]),
    orgZh: orgChinese(tailOrg) || orgChinese(head) || ""
  };
}

export function isUrlLikeTitle(text) {
  const value = String(text || "").trim();
  return /^https?:\/\//i.test(value);
}

export function urlHostLabel(url) {
  try {
    const host = new URL(String(url).trim()).hostname.replace(/^www\./, "");
    if (/feishu\.cn$/i.test(host) || host.includes("feishu")) return "飞书知识库";
    if (/notion\./i.test(host)) return "Notion";
    if (/docs\.google\.com/i.test(host)) return "Google 文档";
    return host;
  } catch {
    return "外部链接";
  }
}

function companyChinese(name) {
  const key = String(name || "").trim().toLowerCase();
  for (const [pattern, zh] of COMPANY_ZH) {
    if (key === pattern || key.startsWith(`${pattern} `)) return zh;
  }
  return "";
}

function regionChinese(fragment) {
  const lower = String(fragment || "").toLowerCase();
  if (/\buk\b|united kingdom|britain/.test(lower)) return "英国";
  if (/\bus\b|united states|america/.test(lower)) return "美国";
  if (/\beu\b|europe/.test(lower)) return "欧洲";
  if (/\bchina\b|hong kong/.test(lower)) return lower.includes("hong kong") ? "香港" : "中国";
  if (/\bafrica\b/.test(lower)) return "非洲";
  return String(fragment || "").trim().slice(0, 24) || "当地";
}

function moneyPhrase(raw) {
  const match = String(raw || "").match(/\$|£|€|(\d)/);
  if (!match) return String(raw || "").trim();
  return String(raw || "")
    .replace(/\bbillion\b/gi, "亿美元")
    .replace(/\bmillion\b/gi, "万美元")
    .replace(/\b(bn|b)\b/gi, "亿")
    .replace(/\s+/g, "")
    .trim();
}

function chineseHeadlineFromEnglishTitle(head, category) {
  const normalized = stripDuplicateSourceSuffix(head);

  const invest = normalized.match(
    /^(.+?)\s+invests?\s+((?:\$|£)[\d.,]+\s*(?:billion|million|bn|m)?)\s+in\s+(.+?)(?:\s*[-–—|]|,|$)/i
  );
  if (invest) {
    const who = companyChinese(invest[1]) || invest[1].trim();
    const where = regionChinese(invest[3]);
    const amt = moneyPhrase(invest[2]);
    const plan = normalized.match(/plans?\s+((?:£|\$)[\d.,]+\s*(?:billion|million)?)\s+by\s+(\d{4})/i);
    if (plan) {
      return `${who}拟在${where}投资约${amt}（至 ${plan[2]} 年累计约 ${moneyPhrase(plan[1])}）`;
    }
    return `${who}拟在${where}投资约${amt}`;
  }

  const overtakes = normalized.match(/^(.+?)\s+overtakes?\s+(.+?)\s+as\s+(.+)$/i);
  if (overtakes) {
    return `${companyChinese(overtakes[1]) || overtakes[1].trim()}超越${overtakes[2].trim()}成为${overtakes[3].trim().slice(0, 28)}`;
  }

  const growth = normalized.match(/^(.+?)\s+growth\s+(.+)$/i);
  if (growth) {
    return `${companyChinese(growth[1]) || growth[1].trim()}：${growth[2].trim().slice(0, 36)}`;
  }

  if (/growth potential|growth seen|earnings|outlook/i.test(normalized)) {
    const entities = normalized.match(/[A-Z][A-Za-z0-9&_.-]{2,}(?:\s+[A-Z][A-Za-z0-9&_.-]{2,}){0,3}/g) || [];
    const names = entities
      .slice(0, 2)
      .map((name) => companyChinese(name) || name.trim())
      .filter(Boolean)
      .join("、");
    if (names) return `${names}：业绩与增长预期引关注`;
  }

  if (isEnglishDominant(normalized)) {
    const factual = factualLineFromEnglish(normalized, titleKeywords(normalized, category))
      .replace(/。+$/, "")
      .trim();
    if (factual && !isGenericInsightPhrase(factual) && cjkCount(factual) >= 4) {
      return factual.slice(0, 56);
    }
    const clip = translateHeadlineClip(normalized, 52);
    if (clip && cjkCount(clip) >= 4) return clip;
  }

  return "";
}

function inferTopicPhrase(title, summary, category) {
  const corpus = `${title} ${summary}`.toLowerCase();
  if (/inflation|interest rate|monetary|financial stability|macro/.test(corpus)) return "通胀与宏观金融政策";
  if (/innovation|credit|experian|fintech/.test(corpus)) return "创新与信用生态";
  if (/red sea|shipping|houthi|suez|war risk|freight/.test(corpus)) return "红海航运与战争险成本";
  if (/ukraine|russia|sanction|war briefing|ceasefire|missile/.test(corpus)) return "俄乌局势与制裁走向";
  if (/raises?\s+\$|series [a-h]|valuation|funding/.test(corpus)) return "融资与估值";
  if (/warns?|warning/.test(corpus)) return "政策与能源安全风险";
  if (/ai|chip|model|semiconductor/.test(corpus)) return "人工智能与算力";
  if (/education|school|student|university|teachers?/.test(corpus)) return "教育与人才政策";
  if (/climate|emission|carbon/.test(corpus)) return "气候与能源转型";
  const hint = CATEGORY_HINT[category] || category;
  return hint && hint !== "要闻" ? `${hint}议题` : "核心议题";
}

function headlineFromPatterns(title, category) {
  const lower = String(title || "").toLowerCase();
  const { head, tailOrg } = splitTitleParts(title);

  if (isUrlLikeTitle(head)) {
    return `${urlHostLabel(head)}文档`;
  }

  const zhHead = chineseHeadlineFromEnglishTitle(head, category);
  if (zhHead) return zhHead;

  const funding = head.match(/^(.+?)\s+raises?\s+(.+)$/i);
  if (funding) {
    const amount = funding[2].match(/\$[\d.]+[bmk]?/i)?.[0] || funding[2].trim().slice(0, 24);
    return `${funding[1].trim()} 融资 ${amount}`;
  }

  const warns = head.match(/^(.+?)\s+warns?\s+(.+)$/i);
  if (warns) {
    const who = warns[1].trim();
    const topic = warns[2].replace(/\s+/g, " ").trim().slice(0, 48);
    return `${who} 警示：${topic}`;
  }

  if (/take the future|into our own hands/i.test(lower) && /ai|a\.i\.|artificial intelligence/i.test(lower)) {
    return "舆论呼吁主动塑造人工智能未来";
  }

  if (/war briefing|ukraine|gaza|middle east conflict/i.test(lower)) {
    const topic = head.replace(/^ukraine war briefing:\s*/i, "").trim();
    return topic ? `俄乌局势：${topic.slice(0, 42)}` : "俄乌局势最新进展";
  }

  if (/red sea|shipping|houthi|suez|container|freight/i.test(lower)) {
    return "红海航运：绕行与运费压力";
  }

  const org = orgChinese(tailOrg);
  if (org && head.length <= 96) {
    const clip = translateHeadlineClip(head, 44);
    if (clip && cjkCount(clip) >= 8) return `${org}：${clip}`;
    const topic = inferTopicPhrase(title, "", category);
    if (!/议题$|走向$|生态$/.test(topic)) return `${org}：${topic}`;
    return buildFactualChineseTitle(title, CATEGORY_HINT[category] || category);
  }

  if (/report on|annual report|briefing|outlook/i.test(head)) {
    const subject = head
      .replace(/^report on\s+/i, "")
      .replace(/['’]s\s+.+$/i, "")
      .trim()
      .slice(0, 36);
    const org = orgChinese(tailOrg);
    if (org) return `${org}发布${subject || "报告"}`;
    return translateHeadlineClip(title, 52) || subject || "最新报告";
  }
  const shortHead = head.length > 40 ? `${head.slice(0, 38)}…` : head;
  if (lineHasChinese(shortHead) && !isEnglishDominant(shortHead)) {
    return shortHead;
  }
  return buildFactualChineseTitle(title, CATEGORY_HINT[category] || category);
}

function ensureChineseHeadline(headline, title, category) {
  if (lineHasChinese(headline) && cjkCount(headline) >= 4 && !isGenericInsightPhrase(headline)) return headline;
  const zh = chineseHeadlineFromEnglishTitle(stripDuplicateSourceSuffix(title), category);
  if (zh && cjkCount(zh) >= 4 && !isGenericInsightPhrase(zh)) return zh;
  return buildFactualChineseTitle(title, CATEGORY_HINT[category] || category);
}

export function buildEventDisplayTitle(event) {
  const title = stripDuplicateSourceSuffix(event.title);
  const category = event.category || "未分类";
  if (isUrlLikeTitle(title)) {
    return `${urlHostLabel(title)}文档`;
  }
  const pres = parsePresentationMeta(title);
  if (pres) {
    const topic = inferTopicPhrase(title, event.summary, category);
    const who = pres.whoShort ? ` ${pres.whoShort}` : "";
    const org = pres.orgZh || "相关机构";
    return ensureChineseHeadline(`${org}${who}：${topic}`, title, category);
  }
  return ensureChineseHeadline(headlineFromPatterns(title, category), title, category);
}

function englishSentences(text) {
  return normalizeNewsText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
}

export function isIngestPlaceholderText(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  return (
    /发布\/收录：「/.test(value)
    || /^来源$/.test(value)
    || /建立的.+类观察条目/.test(value)
    || /建议补充来源链接、时间线/.test(value)
  );
}

export function isTemplateFluff(summary) {
  return (
    /发表演讲，属.+相关动态/.test(summary)
    || /涉及地缘冲突或安全局势/.test(summary)
    || /议题线索：/.test(summary)
    || /建议点击 ↗ 查看英文原文/.test(summary)
    || /出现值得跟踪的重要信息/.test(summary)
    || /围绕「[^」]+」：出现值得跟踪/.test(summary)
    || /详情以原文为准/.test(summary)
    || isGenericInsightPhrase(summary)
    || isIngestPlaceholderText(summary)
  );
}

/** 脉络图/时间轴节点文案：跳过入库占位句，优先中文 desc */
export function resolveTimelinePointText(event, point) {
  const raw = String(point?.text || "").trim();
  if (raw && !isIngestPlaceholderText(raw)) return raw;
  const presented = presentEventForReport(event);
  return presented.desc || presented.summary || "";
}

function briefFromStoredChineseSummary(title, rawSummary, category) {
  const cleaned = stripLeadingLabel(rawSummary, [...DIRECTION_LABELS, category]);
  if (!cleaned || isTemplateFluff(cleaned) || summaryEchoesTitle(title, cleaned)) return "";
  if (isUrlLikeTitle(title) && cleaned.includes(title.slice(0, 24))) {
    const tail = cleaned.replace(title, "").replace(/围绕「[^」]+」/, "").trim();
    if (tail.length >= 12) return tail.slice(0, 160);
  }
  return cleaned.length >= 12 ? cleaned.slice(0, 160) : "";
}

export function buildEventDesc(event) {
  const title = stripDuplicateSourceSuffix(event.title);
  const category = event.category || "未分类";
  const rawSummary = normalizeNewsText(event.summary || "");
  const keywords = titleKeywords(title, category);
  const topic = inferTopicPhrase(title, rawSummary, category);
  const refUrl = Array.isArray(event.references) ? event.references.find((ref) => ref?.url)?.url : "";

  if (isUrlLikeTitle(title)) {
    const host = urlHostLabel(title);
    const fromStore = briefFromStoredChineseSummary(title, rawSummary, category);
    if (fromStore && lineHasChinese(fromStore)) {
      return fromStore.replace(/建议补充来源.*/, "点开 ↗ 查看文档正文。").slice(0, 180);
    }
    return `${host}链接；页面为结构化笔记/知识库，请点 ↗ 打开查看完整内容与附件。`;
  }

  if (rawSummary.length >= 36 && lineHasChinese(rawSummary) && !isTemplateFluff(rawSummary) && !summaryEchoesTitle(title, rawSummary)) {
    const kept = briefFromStoredChineseSummary(title, rawSummary, category);
    if (kept) return kept;
  }

  if (rawSummary.length >= 40 && isEnglishDominant(rawSummary) && !summaryEchoesTitle(title, rawSummary)) {
    const localized = buildChineseSummaryFromEnglish(englishSentences(rawSummary), keywords);
    if (localized && !isTemplateFluff(localized)) return localized;
  }

  const pres = parsePresentationMeta(title);
  if (pres) {
    return `${pres.orgZh || "相关机构"}${pres.whoShort ? ` ${pres.whoShort}` : ""}在${pres.venue}阐述${topic}，或影响区域信贷与创新监管预期。`;
  }

  const invest = title.match(
    /^(.+?)\s+invests?\s+((?:\$|£)[\d.,]+\s*(?:billion|million|bn|m)?)\s+in\s+(.+?)(?:\s*[-–—|]|,|$)/i
  );
  if (invest) {
    const who = companyChinese(invest[1]) || invest[1].trim();
    const where = regionChinese(invest[3]);
    const amt = moneyPhrase(invest[2]);
    const plan = title.match(/plans?\s+((?:£|\$)[\d.,]+\s*(?:billion|million)?)\s+by\s+(\d{4})/i);
    const planText = plan ? `，并规划至 ${plan[2]} 年累计投入约 ${moneyPhrase(plan[1])}` : "";
    return `${who}宣布在${where}新增投资约 ${amt}${planText}；关注落地节奏、就业与数据中心/物流配套。`;
  }

  if (isEnglishDominant(title)) {
    const factual = factualLineFromEnglish(title, keywords).replace(/。+$/, "").trim();
    if (factual && !isGenericInsightPhrase(factual) && cjkCount(factual) >= 8) {
      return factual;
    }
    const clip = translateHeadlineClip(title, 140);
    if (clip && cjkCount(clip) >= 6) {
      return clip;
    }
  }

  const wrapped = buildFactualChineseTitle(title, topic);
  return `${wrapped}。`;
}

/** @deprecated 别名；新代码请用 buildEventDesc */
export function buildEventDisplaySummary(event) {
  return buildEventDesc(event);
}

function inferActionPhrase(title) {
  return factualActionFromText(title) || "";
}

/** @deprecated 使用 buildEventDisplaySummary */
export function buildChineseEventIntro(event) {
  return buildEventDisplaySummary(event);
}

export function shouldLocalizeEventSummary(event) {
  const title = normalizeNewsText(event.title);
  const summary = normalizeNewsText(event.summary);
  if (!summary) return true;
  if (!lineHasChinese(summary) || isEnglishDominant(summary)) return true;
  if (summaryEchoesTitle(title, summary)) return true;
  if (isTemplateFluff(summary)) return true;
  if (/已按「|来自 .* 的最新报道|已纳入.*线索/.test(summary)) return true;
  return false;
}

export function presentEventForReport(event) {
  const title = stripDuplicateSourceSuffix(event.title);
  const category = event.category || "未分类";
  const categoryHint = CATEGORY_HINT[category] || category;

  let displayTitle = buildEventDisplayTitle({ ...event, title });
  let desc = shouldLocalizeEventSummary({ ...event, title })
    ? buildEventDesc({ ...event, title })
    : stripLeadingLabel(normalizeNewsText(event.summary), DIRECTION_LABELS);
  if (isTemplateFluff(desc)) desc = buildEventDesc({ ...event, title });

  const storedSummary = normalizeNewsText(event.summary || "");
  const needsDecisionRewrite =
    isTemplateFluff(storedSummary)
    || isGenericInsightPhrase(storedSummary)
    || isEnglishDominant(title)
    || /核心数据与措辞|以原文为准|；对象：|；主体：/.test(storedSummary)
    || isOverviewJunkLine(displayTitle)
    || isOverviewJunkLine(desc);
  if (needsDecisionRewrite) {
    const decisionOverview = composeDecisionOverview(title, category);
    if (decisionOverview && cjkCount(decisionOverview) >= 16) {
      desc = decisionOverview;
      displayTitle = decisionDisplayTitle(title, category, decisionOverview);
    }
  }

  displayTitle = stripLeadingLabel(displayTitle, [...DIRECTION_LABELS, `${categoryHint}议题`]);
  desc = stripDetailJumpSuffix(desc);

  if (isOverviewJunkLine(displayTitle) || isOverviewJunkLine(desc)) {
    const decisionOverview = composeDecisionOverview(title, category);
    if (decisionOverview) {
      desc = stripDetailJumpSuffix(decisionOverview);
      displayTitle = decisionDisplayTitle(title, category, desc);
    }
  }

  if (isWeakTimelineCopy(displayTitle, desc)) {
    const retryOverview = composeDecisionOverview(title, category) || buildEventDesc({ ...event, title });
    desc = stripDetailJumpSuffix(retryOverview);
    displayTitle = decisionDisplayTitle(title, category, desc) || buildFactualChineseTitle(title, categoryHint);
  }

  return { ...event, title, displayTitle, desc, summary: desc };
}

export { isWeakTimelineCopy, timelineDecisionScore };

/** 概要速览条用：优先中文主题标题，去掉方向标签重复 */
/** 概要条：英文碎片、实体串、模板「相关报道」 */
export function isOverviewJunkLine(text) {
  const value = String(text || "").trim();
  if (!value || value.length < 6) return true;
  if (/相关报道|值得跟踪|；对象：|；主体：|核心数据与措辞|以原文为准/.test(value)) return true;
  const cjk = cjkCount(value);
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  if (latin >= 5 && cjk < 4) return true;
  if (value.includes("、") && latin >= 6 && cjk < 5) return true;
  if (/^(?:[A-Za-z][A-Za-z0-9&_.-]{1,24}、){1,}[A-Za-z]/.test(value) && cjk < 6) return true;
  if (cjk >= 8 && latin < 6) return false;
  if (/议题：/.test(value) && cjk < 14) return true;
  return isGenericInsightPhrase(value);
}

export function overviewFactFromEvent(event, maxLen = 52) {
  const raw = stripLeadingLabel(
    event.displayTitle || event.desc || event.summary || event.title || "",
    [...DIRECTION_LABELS, event.category].filter(Boolean)
  );
  if (!raw || isOverviewJunkLine(raw)) return "";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}…`;
}
