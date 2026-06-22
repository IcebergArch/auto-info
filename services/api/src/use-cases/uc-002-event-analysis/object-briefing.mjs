import {
  OPENROUTER_URL,
  resolveOpenRouterApiKey,
  resolveOpenRouterModel
} from "../../shared/openrouter.mjs";
import { readSystemConfigRaw } from "../uc-004-system-config/service.mjs";

const TIMEOUT_MS = 28000;
const MAX_ITEMS = 16;

/** 推断分析对象类型，用于裁剪 LLM 提示词的视角 */
// 常见A股/港股/美股个股名（识别为 stock），可持续补充
const KNOWN_STOCKS = /茅台|五粮液|宁德时代|比亚迪|招商银行|工商银行|中国平安|腾讯|阿里巴巴|美团|京东|拼多多|小米|立讯|海康|隆基|药明|迈瑞|福耀|海天|片仔癀|长江电力|中芯国际|韦尔|兆易|apple|tesla|nvidia|microsoft|amazon|google|meta|英伟达|特斯拉|苹果/i;

export function inferObjectType(query) {
  const q = String(query || "").trim();
  if (/^https?:\/\//i.test(q)) return "url";
  if (/股票|股价|个股|标的|[A-Z]{2,5}:\d|代码|港股|美股|A股|创业板|科创板|\d{6}\b/i.test(q)) return "stock";
  if (KNOWN_STOCKS.test(q)) return "stock";
  if (/政策|新政|法规|条例|法案|监管|新规|办法|税|补贴|关税|禁令|规划|意见/.test(q)) return "policy";
  if (/市场|行业|赛道|板块|景气|指数/.test(q)) return "market";
  if (/公司|集团|科技|股份|有限|互动|controls|inc|corp|ltd|holdings|科技|生物|医药|新能源/i.test(q)) return "company";
  return "general";
}

// 每类对象配一个"资深分析师"人设 + 必须讲清的分析骨架（动用专业知识，而非复述新闻）
const TYPE_ANALYST = {
  company: {
    persona: "资深产业/商业分析师",
    angle: "讲清这家公司的本质：主营与商业模式、在产业链的位置、真实竞争力与护城河、收入与风险结构、市场常见的认知与误区。"
  },
  stock: {
    persona: "资深二级市场策略分析师",
    angle: "讲清这只标的的本质：对应主体与基本面、股价的真实驱动逻辑（资金面/政策面/情绪面 vs 基本面各占多少）、估值与风险、市场对它的主流叙事与分歧。务必区分'价值'与'价格'。"
  },
  policy: {
    persona: "资深政策研究员",
    angle: "讲清这项政策的本质：真实意图与背景、影响对象与传导路径、执行中的关键变量与阻力、利好谁/利空谁、容易被误读之处。"
  },
  market: {
    persona: "资深宏观/行业研究员",
    angle: "讲清这个市场的本质与底层规则：参与者结构、定价机制、真实驱动因素、当前所处周期、主流共识与潜在盲点。"
  },
  url: {
    persona: "资深领域编辑",
    angle: "提炼这篇资料的核心论点、关键证据与可信度，并指出它的立场或局限。"
  },
  general: {
    persona: "资深情报分析师",
    angle: "讲清这个对象的本质、运行逻辑、关键影响与常见误区。"
  }
};

function trimItems(items) {
  return (items || [])
    .slice(0, MAX_ITEMS)
    .map((it, i) => {
      const title = String(it.title || "").trim();
      const summary = String(it.summary || "").replace(/\s+/g, " ").trim().slice(0, 200);
      const when = it.publishedAt || it.occurredAt || "";
      return `${i + 1}. ${title}${when ? `（${String(when).slice(0, 10)}）` : ""}${summary ? `：${summary}` : ""}`;
    })
    .join("\n");
}

function parseJsonBlock(content) {
  const raw = String(content || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

/**
 * 生成"对象画像"：把检索到的资料/事件归纳成一段可读的全貌介绍。
 * 无 key 或 LLM 失败时返回 { available:false, reason }，由调用方降级。
 */
export async function buildObjectBriefing(query, items, { sourceCount = 0 } = {}) {
  const type = inferObjectType(query);
  const material = trimItems(items);
  const analyst = TYPE_ANALYST[type] || TYPE_ANALYST.general;

  let config;
  try {
    config = await readSystemConfigRaw();
  } catch {
    config = {};
  }
  const apiKey = await resolveOpenRouterApiKey(config);
  if (!apiKey) {
    return { available: false, type, reason: "未配置 LLM（OpenRouter）API Key，已展示原始资料列表。" };
  }

  const isFinance = type === "stock" || type === "market";
  const model = resolveOpenRouterModel(config.llm?.model || "openai/gpt-4.1-mini");
  const prompt = [
    `你是决策者的${analyst.persona}，也是其专属情报代理人。决策者只负责拍板，你负责把功课做完、直接给判断与结论。`,
    `就分析对象「${query}」交付研判。分析重点：${analyst.angle}`,
    "",
    "【铁律：你是代理人，不是布置作业的顾问】",
    "- 禁止'建议你关注/跟踪/留意/观察/注意X'这类把活推回决策者的句式。",
    "- 你已替决策者把调研和判断做完。直接下结论：'判断是X'、'倾向Y'、'已查到Z'。",
    "- 反例：不要写'关注AI芯片供需'；正例：'AI芯片Q3大概率紧缺，利好相关板块，判断偏多'。",
    "",
    "【你的两类信息来源，必须在输出中区分开】",
    "A. 你的专业知识与领域常识——用来讲清对象的本质、运行逻辑、结构性特征、常见误区。即使没有近期新闻，这部分也必须扎实、具体、敢下判断，不要含糊。",
    material
      ? "B. 下面是系统检索到的近期资料（仅作'近期动态'参考，可能零散或不完全相关；不相关的可忽略）：\n" + material
      : "B. 本次未检索到近期外部资料——'近期动态'可留空或注明暂无，但 A 部分的本质分析照常给出。",
    "",
    "要求：",
    "1) 简体中文；信息密度高；敢于给出基于专业判断的结论，但区分'基于通识的判断'与'基于检索到的近期事实'；",
    "2) 不把不相关的检索条目硬塞进结论；近期动态只写真正相关的；",
    "3) 揭示对象的真实运行逻辑与常见认知误区（这是核心价值）；",
    isFinance ? "4) 金融标的：必须点明价格驱动与价值的关系、风险，并声明'不构成投资建议'；" : "4) 指出关键风险或盲点；",
    "5) 仅返回 JSON，无 markdown。",
    "",
    "6) 信息的价值在于指向行动：除了讲清现状，必须给出预判与可操作的进退信号。",
    "",
    "JSON 字段（分析/逻辑/操作 三维）：",
    "{",
    '  "whatItIs": string,        // [分析]它的本质是什么，2-4句，讲透不含糊',
    '  "recent": string[],        // [分析]近期动态，仅写检索资料中真正相关的，0-4条，无则空',
    '  "risks": string[],         // [分析]关键风险/盲点，1-3条',
    '  "logic": string[],         // [逻辑]运行逻辑/结构性特征，2-5条，揭示"为什么是这样"',
    '  "misconceptions": string[],// [逻辑]常见认知误区或易被误读之处，1-3条',
    '  "foresight": string[],     // [操作]预判：1-3条，"接下来大概率会X"的判断性预测，不是"建议关注"',
    '  "entryExit": string[],     // [操作]进退判断：1-3条，"现在偏多/偏空，理由X"或"出现Y则切入/出现Z则退出"',
    '  "conclusion": string       // [操作]一句话拍板建议：作为代理人给决策者的明确结论与倾向',
    "}"
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
        "X-Title": "Nexus Auto-Intel Object Briefing"
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        messages: [
          { role: "system", content: `你是一名${analyst.persona}，输出合法 JSON，简体中文。动用你的专业知识做研判，区分通识判断与检索事实，敢下结论但不杜撰具体数字/事件。` },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      return { available: false, type, reason: `LLM 请求失败（HTTP ${response.status}）` };
    }
    const payload = await response.json();
    const parsed = parseJsonBlock(payload?.choices?.[0]?.message?.content);
    if (!parsed || !parsed.whatItIs) {
      return { available: false, type, reason: "LLM 未返回有效研判。" };
    }
    const arr = (v, n) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : []);
    return {
      available: true,
      type,
      persona: analyst.persona,
      isFinance,
      whatItIs: String(parsed.whatItIs || "").trim(),
      logic: arr(parsed.logic, 5),
      misconceptions: arr(parsed.misconceptions, 3),
      recent: arr(parsed.recent, 4),
      risks: arr(parsed.risks, 3),
      foresight: arr(parsed.foresight, 3),
      entryExit: arr(parsed.entryExit, 3),
      conclusion: String(parsed.conclusion || "").trim()
    };
  } catch (e) {
    return { available: false, type, reason: e.name === "AbortError" ? "LLM 超时" : e.message };
  } finally {
    clearTimeout(timer);
  }
}
