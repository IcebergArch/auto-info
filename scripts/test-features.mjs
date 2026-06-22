import { spawn, execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { productDateKey, todayProductKey } from "../services/api/src/shared/utils.mjs";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.VERIFY_PORT || 4318);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = todayProductKey();

const FEATURE_TESTS = [
  {
    uc: "UC-001",
    name: "intake 类目入库",
    method: "POST",
    path: "/api/v1/daily-events/intake",
    expect: 200,
    body: { query: "功能测试 科技主题", category: "科技" },
    assert: (json) => json.inferredCategory === "科技"
  },
  {
    uc: "UC-001",
    name: "按类目列表",
    method: "GET",
    path: "/api/v1/daily-events?category=科技",
    expect: 200,
    assert: (json) => Array.isArray(json.events)
  },
  {
    uc: "UC-001",
    name: "最新消息外部检索",
    method: "POST",
    path: "/api/v1/daily-events/intake",
    expect: 200,
    body: { query: "AI最新进展", category: "科技" },
    assert: (json) => json.sourceSearch?.attempted === true && Array.isArray(json.sourceSearch.providerStatuses)
  },
  {
    uc: "UC-001",
    name: "日报生成与 review",
    method: "GET",
    path: "/api/v1/daily-events/report",
    expect: 200,
    assert: (json) => {
      const fluff = /监管与产业变动并行|风险与机会并存|重点涉及\s*[^。]{80,}/;
      const overviewText = `${json.overview?.summary || ""}${(json.overview?.bullets || []).join("")}`;
      const blockKeys = ["international", "technology", "finance", "domestic"];
      const legacyDomestic = json.focusSections?.domestic || json.focusSections?.other;
      const blocksOk =
        json.presentation === "timeline"
          ? Array.isArray(json.timeline)
          : blockKeys.every(
              (key) =>
                (key === "domestic" ? legacyDomestic : json.focusSections?.[key])
                && Array.isArray((key === "domestic" ? legacyDomestic : json.focusSections[key]).events)
            );
      const allBlockEvents =
        json.presentation === "timeline"
          ? json.timeline || []
          : blockKeys.flatMap((key) =>
              (key === "domestic" ? legacyDomestic : json.focusSections?.[key])?.events || []
            );
      const englishEvents = allBlockEvents.filter((event) => /[A-Za-z]{10,}/.test(String(event.title || "")));
      const cjkCount = (text) => (String(text || "").match(/[\u4e00-\u9fff]/g) || []).length;
      const chineseSummaryOk = englishEvents.every((event) => {
        const summary = String(event.desc || event.summary || "");
        const displayTitle = String(event.displayTitle || "");
        const templateFluff =
          /发表演讲，属.+相关动态|涉及地缘冲突或安全局势|建议点击 ↗ 查看英文原文|出现值得跟踪的重要信息|存在值得跟踪的变化/.test(
            summary
          )
          || /存在值得跟踪的变化|值得跟踪/.test(displayTitle);
        return (
          cjkCount(summary) >= 4
          && !/&nbsp;/i.test(summary)
          && !templateFluff
          && cjkCount(displayTitle) >= 4
          && !/发表演讲，属/.test(displayTitle)
          && !/核心议题（https?:\/\//.test(displayTitle)
        );
      });
      const allHaveDesc = allBlockEvents.every((event) => {
        const desc = String(event.desc || event.summary || "").trim();
        return desc.length >= 8 && !/建议点击 ↗ 查看英文原文/.test(desc);
      });
      const panels = json.overview?.panels || {};
      const panelKeys = ["international", "technology", "finance"];
      const panelsOk = panelKeys.every(
        (key) => Array.isArray(panels[key]?.points) && panels[key].points.length >= 1
      );
      const bullets = json.overview?.bullets || [];
      const noDuplicateDirectionLabel = bullets.every((line) => {
        const idx = String(line).indexOf("：");
        if (idx <= 0 || idx > 8) return true;
        const label = line.slice(0, idx);
        const body = line.slice(idx + 1).trim();
        return !body.startsWith(`${label}：`);
      });
      const timelineOk =
        json.presentation !== "timeline"
        || (json.refreshIntervalHours === 1 && Array.isArray(json.relatedMaterials) && Array.isArray(json.timeline));
      const sameDayOnly =
        json.date !== TODAY
        || (json.events || []).every((event) => productDateKey(event.occurredAt) === TODAY);
      const noCrossDaySummary =
        json.date !== TODAY
        || !/（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/.test(json.overview?.summary || "");
      return (
        json.overview?.summary &&
        Array.isArray(json.events) &&
        json.title === "今日日报" &&
        Array.isArray(json.sections) &&
        json.review?.count >= 1 &&
        blocksOk &&
        timelineOk &&
        sameDayOnly &&
        noCrossDaySummary &&
        !json.focusSections?.macro &&
        !json.focusSections?.interests &&
        !fluff.test(overviewText) &&
        chineseSummaryOk &&
        allHaveDesc &&
        panelsOk &&
        noDuplicateDirectionLabel
      );
    }
  },
  {
    uc: "UC-001",
    name: "日报单日更新",
    method: "POST",
    path: "/api/v1/daily-events/report/update",
    expect: 200,
    body: { date: TODAY, pullSources: false },
    assert: (json) => json.ok === true && json.report?.review?.count >= 1 && Array.isArray(json.report?.sections)
  },
  {
    uc: "UC-001",
    name: "日报区间回溯补齐",
    method: "POST",
    path: "/api/v1/daily-events/report/backfill",
    expect: 200,
    body: { from: TODAY, to: TODAY, pullSources: false },
    assert: (json) => json.ok === true && json.totalDays === 1 && Array.isArray(json.reports) && json.report?.review?.count >= 1
  },
  {
    uc: "UC-001",
    name: "日报按月回溯补齐",
    method: "POST",
    path: "/api/v1/daily-events/report/backfill",
    expect: 200,
    body: { month: TODAY.slice(0, 7), pullSources: false },
    assert: (json) =>
      json.ok === true &&
      json.totalDays >= 1 &&
      json.totalDays <= 31 &&
      json.to === TODAY &&
      typeof json.from === "string" &&
      json.from.endsWith("-01")
  },
  {
    uc: "UC-001",
    name: "日报按天数回溯补齐",
    method: "POST",
    path: "/api/v1/daily-events/report/backfill",
    expect: 200,
    body: { days: 3, to: TODAY, pullSources: false },
    assert: (json) => json.ok === true && json.totalDays === 3 && json.days === 3 && json.to === TODAY
  },
  {
    uc: "UC-001",
    name: "日报手动存储",
    method: "POST",
    path: "/api/v1/daily-events/report/store",
    expect: 200,
    body: {},
    assert: (json) => json.ok === true && json.report?.review?.count >= 1 && Boolean(json.storedAt)
  },
  {
    uc: "UC-001",
    name: "日报归档列表",
    method: "GET",
    path: "/api/v1/daily-events/reports",
    expect: 200,
    assert: (json) => {
      if (!Array.isArray(json.items)) return false;
      const todayItem = json.items.find((item) => item.date === TODAY);
      const todayOk = !todayItem || todayItem.title === "今日日报";
      const historyOk = json.items.every(
        (item) =>
          item.date <= TODAY
          && (item.date === TODAY || (item.title !== "今日日报" && item.title !== "今日"))
      );
      return todayOk && historyOk;
    }
  },
  {
    uc: "UC-001",
    name: "日报归档删除",
    method: "DELETE",
    path: `/api/v1/daily-events/reports/${TODAY}`,
    expect: 200,
    assert: (json) => json.ok === true && typeof json.deleted === "boolean"
  },
  {
    uc: "UC-001",
    name: "咨询历史",
    method: "GET",
    path: "/api/v1/daily-events/search-history",
    expect: 200,
    assert: (json) => Array.isArray(json.items)
  },
  {
    uc: "UC-001",
    name: "关注类别列表",
    method: "GET",
    path: "/api/v1/daily-events/focus",
    expect: 200,
    assert: (json) => Array.isArray(json.items)
  },
  {
    uc: "UC-001",
    name: "关注类别新增与删除",
    method: "POST",
    path: "/api/v1/daily-events/focus",
    expect: 200,
    body: { name: "功能测试关注项" },
    assert: (json) => Array.isArray(json.items) && json.items.includes("功能测试关注项")
  },
  {
    uc: "UC-001",
    name: "关注类别删除",
    method: "DELETE",
    path: "/api/v1/daily-events/focus/%E5%8A%9F%E8%83%BD%E6%B5%8B%E8%AF%95%E5%85%B3%E6%B3%A8%E9%A1%B9",
    expect: 200,
    assert: (json) => json.ok === true && typeof json.deleted === "boolean"
  },
  {
    uc: "UC-001",
    name: "刷新今日热点",
    method: "POST",
    path: "/api/v1/daily-events/refresh",
    expect: 200,
    assert: (json) => json.ok === true
  },
  {
    uc: "UC-002",
    name: "标签列表",
    method: "GET",
    path: "/api/v1/analysis/tags",
    expect: 200,
    assert: (json) => Array.isArray(json.tags)
  },
  {
    uc: "UC-002",
    name: "关联图谱",
    method: "GET",
    path: "/api/v1/analysis/graph?query=AI&tags=%E9%87%8D%E5%A4%A7",
    expect: 200,
    assert: (json) => {
      const sourceOk = ["neo4j", "memory"].includes(json.graphSource);
      const matchModeOk = ["direct", "fallback"].includes(json.matchMode);
      const neo4jOk = json.graphSource === "memory"
        || (json.neo4j && typeof json.neo4j.synced === "boolean");
      return sourceOk
        && matchModeOk
        && neo4jOk
        && typeof json.sessionId === "string"
        && Array.isArray(json.nodes)
        && json.nodes.every((node) => node.dimension && node.depth)
        && Array.isArray(json.edges);
    }
  },
  {
    uc: "UC-002",
    name: "中文事件词分析（俄乌冲突）",
    method: "GET",
    path: "/api/v1/analysis/analyze?query=%E4%BF%84%E4%B9%8C%E5%86%B2%E7%AA%81&coreOnly=1",
    expect: 200,
    assert: (json) => {
      const ch = json.chronology || {};
      const el = json.eventLines || {};
      const lanes = Array.isArray(el.lanes) ? el.lanes : [];
      const influences = Array.isArray(el.influences) ? el.influences : [];
      const totalPoints = lanes.reduce((sum, lane) => sum + (lane.points?.length || 0), 0);
      const timeAxisOk = ["history-short-recent-long", "long-conflict-balanced"].includes(el.timeAxis?.mode)
        && typeof el.timeAxis?.recentStart === "string"
        && Array.isArray(el.timeAxis?.ticks)
        && el.timeAxis.ticks.length >= 3;
      const mainLane = lanes.find((lane) => lane.kind === "main" || lane.id === "main-lane");
      const mainPts = mainLane?.points || [];
      const mainYears = [...new Set(mainPts.map((p) => new Date(p.at).getUTCFullYear()).filter(Number.isFinite))].sort(
        (a, b) => a - b
      );
      const milestoneContinuityOk =
        mainPts.length >= 4
        && mainYears.length >= 3
        && (!mainYears.includes(2022) || mainYears.some((y) => y >= 2023 && y <= 2025));
      const recentDensityOk = (() => {
        const recentStart = el.timeAxis?.recentStart ? new Date(el.timeAxis.recentStart).getTime() : 0;
        const allPts = lanes.flatMap((lane) => lane.points || []);
        const before = allPts.filter((p) => new Date(p.at).getTime() < recentStart);
        const after = allPts.filter((p) => new Date(p.at).getTime() >= recentStart);
        if (before.length < 2 || after.length < 2) return true;
        const spanX = (pts) => Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
        const spanT = (pts) =>
          Math.max(...pts.map((p) => new Date(p.at).getTime())) - Math.min(...pts.map((p) => new Date(p.at).getTime()));
        if (spanX(after) <= 0 || spanT(after) <= 0) return true;
        const densityBefore = spanX(before) / Math.max(1, spanT(before));
        const densityAfter = spanX(after) / Math.max(1, spanT(after));
        return densityAfter >= densityBefore * 0.85;
      })();
      return Array.isArray(json.nodes)
        && json.nodes.length > 0
        && typeof json.sessionId === "string"
        && json.sessionId.startsWith("analysis-")
        && ["mysql", "memory"].includes(json.recallSource)
        && ch.timeRange?.start
        && ch.timeRange?.end
        && ["history-short-recent-long", "long-conflict-balanced"].includes(ch.timeAxis?.mode)
        && lanes.length >= 3
        && totalPoints >= 3
        && influences.length >= 1
        && el.timeRange?.start
        && timeAxisOk
        && recentDensityOk
        && milestoneContinuityOk
        && (json.eventLines?.axisNarrative?.headline || json.chronology?.axisNarrative?.headline)
        && lanes.every((lane) => typeof lane.y === "number" && Array.isArray(lane.points));
    }
  },
  {
    uc: "UC-002",
    name: "分析历史列表",
    method: "GET",
    path: "/api/v1/analysis/history?limit=5",
    expect: 200,
    assert: (json) =>
      Array.isArray(json.items)
      && json.items.length >= 1
      && json.items[0].sessionId
      && json.items[0].query
      && typeof json.items[0].preview === "string"
  },
  {
    uc: "UC-003",
    name: "阅读会话创建",
    method: "POST",
    path: "/api/v1/reading-assistant/sessions",
    expect: 201,
    body: {
      title: "功能测试资料",
      text: "这是一条用于阅读助手功能测试的足够长的正文，用于生成摘要与要点。"
    },
    assert: (json) => {
      const r = json.report || {};
      const paper = r.paper || r;
      const text = `${paper.summary || ""}${(paper.keyPoints || []).join("")}${(paper.recommendations || []).join("")}`;
      const points = Array.isArray(paper.keyPoints) ? paper.keyPoints : [];
      const recs = Array.isArray(paper.recommendations) ? paper.recommendations : [];
      const fluff = /揭示了该领域|跨领域融合|可持续发展能力|详实的数据和案例/;
      return Boolean(paper.summary)
        && /[\u4e00-\u9fff]/.test(text)
        && points.length >= 2
        && recs.length >= 1
        && !fluff.test(text);
    }
  },
  {
    uc: "UC-003",
    name: "英文资料中文摘要",
    method: "POST",
    path: "/api/v1/reading-assistant/sessions",
    expect: 201,
    body: {
      title: "English policy brief",
      text: "Global markets reacted to new AI chip export restrictions. Central banks signaled slower rate cuts while supply chain risks remain elevated for semiconductor logistics."
    },
    assert: (json) => {
      const r = json.report || {};
      const paper = r.paper || r;
      const text = `${paper.summary || ""}${(paper.keyPoints || []).join("")}${(paper.recommendations || []).join("")}`;
      const points = Array.isArray(paper.keyPoints) ? paper.keyPoints : [];
      const recs = Array.isArray(paper.recommendations) ? paper.recommendations : [];
      return /[\u4e00-\u9fff]/.test(text)
        && !/Global markets reacted/i.test(text)
        && points.length >= 2
        && recs.length >= 1
        && !points.some((line) => /出现新的变化信号/.test(String(line)));
    }
  },
  {
    uc: "UC-003",
    name: "智能输入自动识别",
    method: "POST",
    path: "/api/v1/reading-assistant/sessions",
    expect: 201,
    body: {
      title: "智能输入测试",
      smartInput:
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ\n这段字幕用于测试自动识别并生成中文概要。视频讨论模型部署、API 成本、延迟指标和上线前的容量压测，足以形成摘要与要点。"
    },
    assert: (json) => {
      const points = Array.isArray(json.report?.keyPoints) ? json.report.keyPoints : [];
      const fluff = /揭示了该领域|跨领域融合|可持续发展能力/;
      return Boolean(json.report?.summary)
        && /[\u4e00-\u9fff]/.test(String(json.report?.summary || ""))
        && points.length >= 1
        && !fluff.test(`${json.report?.summary || ""}${points.join("")}`);
    }
  },
  {
    uc: "UC-003",
    name: "音频链接加转写生成简报",
    method: "POST",
    path: "/api/v1/reading-assistant/sessions",
    expect: 201,
    body: {
      title: "AI 播客转写",
      smartInput:
        "https://example.com/podcast/ai-infra.mp3\n本期音频讨论 AI 数据中心的电力约束、GPU 供应链和推理成本。嘉宾建议工程团队跟踪单位 token 成本、机房功耗和模型延迟，并在上线前做容量压测。"
    },
    assert: (json) => {
      const report = json.report || {};
      const paper = report.paper || report;
      const text = `${paper.summary || ""}${(paper.keyPoints || []).join("")}${(paper.recommendations || []).join("")}`;
      return report.sourceType === "audio"
        && report.sources?.audioUrl
        && /[\u4e00-\u9fff]/.test(text)
        && Array.isArray(paper.keyPoints)
        && paper.keyPoints.length >= 2;
    }
  },
  {
    uc: "UC-003",
    name: "直连音视频无转写拒绝",
    method: "POST",
    path: "/api/v1/reading-assistant/sessions",
    expect: 422,
    body: { smartInput: "https://example.com/video/demo.mp4" },
    assert: (json) => /字幕|转写|音视频/.test(String(json.error || ""))
  },
  {
    uc: "UC-003",
    name: "过短输入拒绝模板摘要",
    method: "POST",
    path: "/api/v1/reading-assistant/sessions",
    expect: 422,
    body: { smartInput: "智能输入测试" },
    assert: (json) => typeof json.error === "string" && json.error.length > 0
  },
  {
    uc: "UC-003",
    name: "阅读历史",
    method: "GET",
    path: "/api/v1/reading-assistant/history",
    expect: 200,
    assert: (json) => Array.isArray(json.items)
  },
  {
    uc: "UC-004",
    name: "配置读取",
    method: "GET",
    path: "/api/v1/config",
    expect: 200,
    assert: (json) => json.storage?.primary === "mysql" && json.graph?.provider === "neo4j"
  },
  {
    uc: "UC-004",
    name: "链路状态",
    method: "GET",
    path: "/api/v1/config/status",
    expect: 200,
    assert: (json) => Boolean(json.storage?.status) && Boolean(json.graph?.status)
  },
  {
    uc: "UC-004",
    name: "链路同步",
    method: "POST",
    path: "/api/v1/config/sync",
    expect: 200,
    assert: (json) => Boolean(json.mysql?.status) && Boolean(json.neo4j?.status)
  },
  {
    uc: "UC-006",
    name: "科技雷达 feed",
    method: "GET",
    path: "/api/v1/tech-radar/feed",
    expect: 200,
    assert: (json) => {
      const weak = /值得跟踪|；对象：/;
      const recent = json.recent || [];
      const archives = json.archives || [];
      const hasHarness = recent.some((e) => /harness/i.test(`${e.term} ${e.title}`));
      const hasLoop = recent.some((e) => /loop|cursor/i.test(`${e.term} ${e.title}`));
      const hasMay = archives.some((e) => String(e.occurredAt || "").startsWith("2026-05"));
      const clean = [...recent, ...archives].every((e) => !weak.test(`${e.title} ${e.brief}`));
      return (
        hasHarness
        && hasLoop
        && hasMay
        && clean
        && Array.isArray(json.relatedMaterials)
        && json.refreshIntervalHours === 1
      );
    }
  }
];

function log(kind, message) {
  console.log(`[test:features] ${kind}: ${message}`);
}

async function request(baseUrl, test) {
  const response = await fetch(`${baseUrl}${test.path}`, {
    method: test.method,
    headers: test.body ? { "Content-Type": "application/json" } : undefined,
    body: test.body ? JSON.stringify(test.body) : undefined
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${test.name} 响应非 JSON`);
  }
  if (response.status !== test.expect) {
    throw new Error(`${test.name} 期望 HTTP ${test.expect}，实际 ${response.status}`);
  }
  if (test.assert && !test.assert(json)) {
    throw new Error(`${test.name} 响应断言失败`);
  }
}

async function main() {
  log("start", `PORT=${PORT}`);
  const child = spawn("node", ["server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const baseUrl = `http://${HOST}:${PORT}`;
  try {
    for (let i = 0; i < 40; i += 1) {
      const ok = await fetch(baseUrl).then((r) => r.status === 200).catch(() => false);
      if (ok) break;
      await delay(200);
    }

    for (const test of FEATURE_TESTS) {
      await request(baseUrl, test);
      log("ok", `${test.uc} ${test.name}`);
    }

    const historyRes = await fetch(`${baseUrl}/api/v1/analysis/history?limit=1`);
    const historyJson = await historyRes.json();
    const sessionId = historyJson.items?.[0]?.sessionId;
    if (!sessionId) throw new Error("分析历史回填 无 sessionId");
    const sessionRes = await fetch(`${baseUrl}/api/v1/analysis/sessions/${encodeURIComponent(sessionId)}`);
    const sessionJson = await sessionRes.json();
    if (sessionRes.status !== 200 || !sessionJson.result?.eventLines || !Array.isArray(sessionJson.result.nodes)) {
      throw new Error("分析历史回填 会话结果不完整");
    }
    log("ok", "UC-002 分析历史回填");

    const analyzeUrl = `${baseUrl}/api/v1/analysis/analyze?query=%E4%BF%84%E4%B9%8C%E5%86%B2%E7%AA%81&coreOnly=1`;
    const first = await fetch(analyzeUrl).then((r) => r.json());
    const second = await fetch(analyzeUrl).then((r) => r.json());
    if (!first.sessionId || first.sessionId !== second.sessionId) {
      throw new Error("同主事件分析应复用同一 sessionId");
    }
    const crossUrl = `${baseUrl}/api/v1/analysis/analyze?query=%E4%BF%84%E4%B9%8C%E5%86%B2%E7%AA%81&secondaryQuery=%E6%AC%A7%E6%B4%B2&coreOnly=1`;
    const cross = await fetch(crossUrl).then((r) => r.json());
    if (!cross.sessionId || cross.sessionId === first.sessionId) {
      throw new Error("带 secondaryQuery 的分析应使用独立 sessionId");
    }
    const historyRes2 = await fetch(`${baseUrl}/api/v1/analysis/history?limit=50`);
    const historyJson2 = await historyRes2.json();
    const ruPrimary = (historyJson2.items || []).filter(
      (item) => item.query === "俄乌冲突" && !item.secondaryQuery
    );
    if (ruPrimary.length !== 1) {
      throw new Error(`俄乌冲突主分析历史应仅 1 条，实际 ${ruPrimary.length}`);
    }
    log("ok", "UC-002 分析会话去重");

    const readBody = {
      title: "LRU 阅读测试",
      text: "这是阅读助手 LRU 去重测试正文，需要足够长度以生成有效中文技术简报与要点建议。"
    };
    const readPost = (body) =>
      fetch(`${baseUrl}/api/v1/reading-assistant/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      }).then((r) => r.json());
    const read1 = await readPost(readBody);
    const read2 = await readPost(readBody);
    if (!read1.sessionId || read1.sessionId !== read2.sessionId) {
      throw new Error("阅读助手重复正文应复用同一 sessionId");
    }
    const readHist = await fetch(`${baseUrl}/api/v1/reading-assistant/history?limit=50`).then((r) => r.json());
    const lruMatches = (readHist.items || []).filter((item) => item.title === readBody.title);
    if (lruMatches.length !== 1) {
      throw new Error(`LRU 阅读历史应仅 1 条，实际 ${lruMatches.length}`);
    }
    if (readHist.items?.[0]?.sessionId !== read1.sessionId) {
      throw new Error("重复访问后 LRU 会话应位于历史顶部");
    }
    log("ok", "UC-003 阅读 LRU 去重");

    log("done", `通过 ${FEATURE_TESTS.length + 3} 项功能测试`);
  } finally {
    child.kill("SIGTERM");
    await delay(200);
  }
}

main().catch((error) => {
  console.error(`[test:features] FAILED: ${error.message}`);
  process.exit(1);
});
