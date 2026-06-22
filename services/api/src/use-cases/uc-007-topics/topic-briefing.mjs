import {
  OPENROUTER_URL,
  resolveOpenRouterApiKey,
  resolveOpenRouterModel
} from "../../shared/openrouter.mjs";
import { readSystemConfigRaw } from "../uc-004-system-config/service.mjs";

const TIMEOUT_MS = 30000;
const MAX_ITEMS = 24;

function sortByTimeDesc(items) {
  return [...items].sort(
    (a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime()
  );
}

function splitRecentHistory(items) {
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const recent = [];
  const history = [];
  for (const it of items) {
    const ts = new Date(it.occurredAt || 0).getTime();
    (ts >= cutoff ? recent : history).push(it);
  }
  return { recent, history };
}

function renderMaterial(items) {
  return items
    .slice(0, MAX_ITEMS)
    .map((it, i) => {
      const t = String(it.title || "").trim();
      const s = String(it.summary || "").replace(/\s+/g, " ").trim().slice(0, 160);
      const when = String(it.occurredAt || "").slice(0, 10);
      const sev = it.severity != null ? ` 冲击${it.severity}` : "";
      return `${i + 1}.[${when}${sev}] ${t}${s ? "：" + s : ""}`;
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

/** 清洗 mermaid 源码：去掉 ```mermaid fence，确保以 graph/flowchart 开头 */
function sanitizeMermaid(src) {
  let s = String(src || "").trim();
  s = s.replace(/^```\s*mermaid\s*/i, "").replace(/```\s*$/i, "").trim();
  if (!s) return "";
  if (!/^(graph|flowchart)\s/i.test(s)) return "";
  // mermaid 对中文节点文本需用 [" "] 包裹；这里仅做基本长度保护
  return s.length > 1500 ? "" : s;
}

/**
 * 生成"情报秘书呈报"：以替决策者预先消化信息的视角，
 * 把议题信号综合为研判，而非罗列。无 key/失败时返回 {available:false,reason}。
 */
export async function buildTopicBriefing(topic, signals) {
  const items = sortByTimeDesc(signals || []);
  if (!items.length) {
    return { available: false, reason: "议题暂无信号，刷新或回溯后可生成研判。" };
  }

  let config;
  try {
    config = await readSystemConfigRaw();
  } catch {
    config = {};
  }
  const apiKey = await resolveOpenRouterApiKey(config);
  if (!apiKey) {
    return { available: false, reason: "未配置 LLM（OpenRouter）API Key，仅展示信号列表。" };
  }

  const { recent, history } = splitRecentHistory(items);
  const model = resolveOpenRouterModel(config.llm?.model || "openai/gpt-4.1-mini");

  // 用户已沉淀的认知（结论/逻辑/决策）——用于"认知校验"，对照新信息看哪条被印证/挑战
  const k = topic.knowledge || {};
  const priorNotes = [
    ...(k.takeaways || []).map((n) => `结论：${n.text}`),
    ...(k.reasoning || []).map((n) => `逻辑：${n.text}`),
    ...(k.decisions || []).map((n) => `决策：${n.text}`)
  ].slice(0, 20);

  const prompt = [
    `你是决策者的资深领域分析师 + 专属情报代理人，就议题「${topic.title}」（检索词：${topic.query}）交付呈报。`,
    "决策者只负责拍板，你负责把功课做完、直接给判断与结论。",
    "【铁律】禁止'建议你关注/跟踪/留意X'这类把活推回决策者的句式；你已替他把调研判断做完，直接下结论：'判断是X'、'倾向Y'、'已查到Z'。",
    "",
    `【近期信号 · 最近30天，${recent.length}条】`,
    recent.length ? renderMaterial(recent) : "（近期无新信号）",
    "",
    `【历史/背景信号，${history.length}条】`,
    history.length ? renderMaterial(history) : "（无历史背景）",
    "",
    priorNotes.length
      ? `【决策者已沉淀的认知/判断，需校验】\n${priorNotes.join("\n")}`
      : "【决策者尚未沉淀认知】（cognitiveCheck 可说明暂无可校验的既有判断）",
    "",
    "信息的价值在于指向行动与认知更新。请输出 JSON（简体中文，信息密度高，禁套话，敢下判断但不杜撰具体数字/事件）：",
    "{",
    '  "verdict": string,            // 一句话研判：当前态势与最要紧的事',
    '  "clusters": [ {"theme": string, "gist": string} ],  // 2-5个主题簇,每簇一句话',
    '  "trend": string,             // 态势变化:近期vs历史,升级/降温/转向',
    '  "foresight": string[],       // 预判:1-3条,"接下来大概率会X"的判断性预测,不是"建议关注"',
    '  "entryExit": string[],       // 进退判断:1-3条,"现在偏多/偏空,理由X"或"出现Y则切入/出现Z则退出"',
    '  "cognitiveCheck": string[],  // 认知校验:1-3条,对照决策者既有判断,指出哪条被新信息印证/挑战/需微调;无既有判断则给出"我替你确立的初始判断"',
    '  "conclusion": string,        // 一句话拍板建议:作为代理人给决策者的明确结论与倾向',
    '  "mermaid": string            // 关联图:mermaid flowchart源码,节点文本用["中文"]包裹,关系用-->加标签,≤8节点',
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
        "X-Title": "Nexus Auto-Intel Topic Briefing"
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        messages: [
          { role: "system", content: "你是资深领域分析师兼情报秘书，只输出合法 JSON，简体中文，动用专业知识研判而非罗列，敢下判断但不杜撰。" },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      return { available: false, reason: `LLM 请求失败（HTTP ${response.status}）` };
    }
    const payload = await response.json();
    const parsed = parseJsonBlock(payload?.choices?.[0]?.message?.content);
    if (!parsed || !parsed.verdict) {
      return { available: false, reason: "LLM 未返回有效呈报。" };
    }
    const arr = (v, n) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : []);
    return {
      available: true,
      generatedAt: new Date().toISOString(),
      recentCount: recent.length,
      historyCount: history.length,
      verdict: String(parsed.verdict || "").trim(),
      clusters: Array.isArray(parsed.clusters)
        ? parsed.clusters
          .filter((c) => c && (c.theme || c.gist))
          .map((c) => ({ theme: String(c.theme || "").trim(), gist: String(c.gist || "").trim() }))
          .slice(0, 5)
        : [],
      trend: String(parsed.trend || "").trim(),
      foresight: arr(parsed.foresight, 3),
      entryExit: arr(parsed.entryExit, 3),
      cognitiveCheck: arr(parsed.cognitiveCheck, 3),
      conclusion: String(parsed.conclusion || "").trim(),
      mermaid: sanitizeMermaid(parsed.mermaid)
    };
  } catch (e) {
    return { available: false, reason: e.name === "AbortError" ? "LLM 超时" : e.message };
  } finally {
    clearTimeout(timer);
  }
}
