/**
 * 决策向文案：标题 + 概述须能支撑投资/就业/旅行等重大判断，禁止模板空话。
 */

import {
  cjkCount,
  extractNamedEntitiesFromEnglish,
  factualActionFromText,
  isGenericInsightPhrase,
  lineHasChinese,
  translateHeadlineClip
} from "../uc-003-reading-assistant/chinese-brief.mjs";
function normalizeTitle(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localTemplateFluff(text) {
  const value = String(text || "").trim();
  return (
    isGenericInsightPhrase(value)
    || /发表演讲，属.+相关动态/.test(value)
    || /建议点击 ↗ 查看英文原文/.test(value)
    || /出现值得跟踪的重要信息/.test(value)
    || /核心数据与措辞以原文为准/.test(value)
    || /以原文为准/.test(value)
    || /；对象：|；主体：/.test(value)
    || /议题：/.test(value)
  );
}

function extractAmount(text) {
  return (
    String(text || "").match(
      /(?:₦|\$|£|€)[\d.,]+\s*(?:trillion|billion|million|bn|m)?|\d+(?:\.\d+)?\s*(?:trillion|billion|million)/gi
    )?.[0] || ""
  );
}

export function stripDetailJumpSuffix(text) {
  return String(text || "")
    .replace(/（详情\s*↗）/g, "")
    .replace(/（↗）/g, "")
    .replace(/建议点击 ↗ 查看英文原文/g, "")
    .trim();
}

export function isWeakTimelineCopy(displayTitle, desc) {
  const title = stripDetailJumpSuffix(displayTitle);
  const body = stripDetailJumpSuffix(desc);
  const blob = `${title} ${body}`;
  if (!title || !body) return true;
  if (localTemplateFluff(title) || localTemplateFluff(body)) return true;
  if (isGenericInsightPhrase(title) || isGenericInsightPhrase(body)) return true;
  if (/议题：/.test(title)) return true;
  if (/；对象：|；主体：/.test(blob)) return true;
  if (/^[^。，]{2,28}，[^。，]{2,24}，/.test(body)) return true;
  if (cjkCount(title) < 6 || cjkCount(body) < 14) return true;
  if (title === body) return true;
  if (body.startsWith(title) && title.length > 24 && title.length / body.length > 0.88) return true;
  return false;
}

export function composeDecisionOverview(title, category = "未分类") {
  const raw = normalizeTitle(title);
  const lower = raw.toLowerCase();

  if (/clarity act|lummis/i.test(lower)) {
    return "美国参议员 Lummis 推动 Clarity Act 立法，将决定美国在下一代金融与加密基础设施监管上领先或落后，直接影响创新融资门槛与合规成本。";
  }
  if (/monetary tightening|cbn withdraws|withdraws?.*trillion/i.test(lower)) {
    const amt = extractAmount(raw) || "7.30 万亿奈拉";
    return `尼日利亚央行深化货币紧缩，从银行体系回笼约 ${amt}，当地融资利率与汇率波动可能上升，需关注新兴市场敞口。`;
  }
  if (/\bfed\b|federal reserve|from fed/i.test(lower) && /key|minutes|rate|policy/i.test(lower)) {
    return "美联储释放新的政策信号，市场正重新定价降息路径与美元流动性，影响股债汇率与跨境资金配置。";
  }
  if (/rate hike|rate cut|raises rates|cuts rates|interest rate/i.test(lower)) {
    return "主要央行利率预期出现调整，资产定价与汇率波动加大，投资组合久期与货币敞口需重新评估。";
  }
  if (/layoff|job cuts?|unemployment/i.test(lower)) {
    return "就业市场出现新的收缩信号，可能影响消费与企业盈利预期，需关注行业招聘与工资趋势。";
  }
  if (/visa|travel ban|flight|airline|border/i.test(lower)) {
    return "跨境出行与签证政策出现变化，可能影响商务与旅游安排，建议核对目的地入境要求。";
  }
  if (/ukraine/i.test(lower) && /grey zone|gray zone|europe cannot afford/i.test(lower)) {
    return "欧洲政策界警示乌克兰长期陷入地缘灰区，可能延长欧洲安全承诺、援助预算与防务产业压力。";
  }
  if (/war|conflict|sanction|missile|ukraine|russia/i.test(lower)) {
    return "地缘冲突或制裁局势升级，能源、航运与避险资产波动加剧，需评估供应链与出行安全风险。";
  }
  if (/inflation|cpi|ppi/i.test(lower)) {
    return "通胀数据或预期出现变化，影响央行政策与债券收益率，关系储蓄购买力与资产配置。";
  }
  if (/forex|stocks|stock market|equit|seoul|kospi|nikkei/i.test(lower)) {
    return "区域股市与外汇波动联动，资金流动或影响科技与高 beta 板块风险偏好。";
  }
  if (/chip|semiconductor|export control|export restriction|gpu/i.test(lower) && /ai|china|us|biden|policy/i.test(lower)) {
    return "AI 芯片出口管制政策再受关注，可能重塑算力供应链与相关厂商订单预期。";
  }
  if (/red sea|shipping|insurance|freight|houthi|suez/i.test(lower)) {
    return "红海航运与战争险保费抬升，亚欧供应链成本与交期面临上行压力。";
  }
  if (/presentation|summit|innovation|experian/i.test(lower) && /governor|bank|央行|nationalbank/i.test(lower)) {
    return "央行高官在公开峰会阐述创新与信用政策取向，可能影响金融科技监管预期与信贷环境。";
  }
  if (
    (/artificial intelligence|a\.i\.|into our own hands|take the future/i.test(lower) || /opinion/i.test(lower))
    && /ai|future|hands|technology/i.test(lower)
  ) {
    return "评论界讨论人工智能应由社会主动塑造发展节奏，而非被动跟随，可能影响科技监管预期与相关板块情绪。";
  }

  const clip = translateHeadlineClip(raw, 90);
  if (lineHasChinese(clip) && cjkCount(clip) >= 10) {
    const hint =
      category === "金融" || category === "宏观"
        ? "关注对利率、汇率与投资仓位的影响。"
        : category === "科技"
          ? "关注对产业链投资与就业结构的影响。"
          : "关注对个人出行、就业或资产配置的潜在影响。";
    return `${clip}。${hint}`;
  }

  return "";
}

export function decisionDisplayTitle(title, category, overview) {
  const fromOverview = stripDetailJumpSuffix(overview).split("。")[0]?.trim() || "";
  let short = fromOverview.split(/[，,]/)[0]?.trim() || fromOverview;
  if (short.length > 40) short = `${short.slice(0, 38)}…`;
  if (short.length >= 12 && short.length <= 44 && !isGenericInsightPhrase(short)) {
    return short;
  }
  const clip = translateHeadlineClip(title, 52);
  if (clip && cjkCount(clip) >= 8 && !/^[^。，]{1,12}议题：/.test(clip)) return clip;
  if (short.length >= 12 && short.length <= 44 && !isGenericInsightPhrase(short) && !/^[^。，]{1,12}议题：/.test(short)) {
    return short;
  }
  return short.slice(0, 44) || clip.slice(0, 52);
}

export function timelineDecisionScore(event) {
  let score = Number(event.severity || 0);
  if (event.special) score += 20;
  const title = event.displayTitle || "";
  const desc = event.desc || event.summary || "";
  if (!isWeakTimelineCopy(title, desc)) score += 30;
  const blob = `${title} ${desc}`;
  if (/投资|利率|就业|汇率|制裁|战争|裁员|通胀|央行|美联储|融资|出行|签证|降息|加息/.test(blob)) score += 15;
  if (/\d|%|万亿|亿|美元|奈拉|trillion|billion/i.test(blob)) score += 10;
  return score;
}
