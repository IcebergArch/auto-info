import { readTopicsStore } from "./topics-store.mjs";
import { backfillTopicSignals } from "./service.mjs";
import { readSystemConfigRaw } from "../uc-004-system-config/service.mjs";

/**
 * 烛龙·情报自动拉取调度：周期性为所有 active 议题主动拉取+刷新呈报。
 * 兑现"自动地拉取更新"。串行错峰，避免并发打爆数据源/LLM。
 *
 * 间隔取 config.product.refreshIntervalHours（默认 1h），可设环境变量
 * TOPIC_AUTO_PULL=off 关闭。
 */

let timer = null;
let running = false;
let lastRunAt = null;
let lastResult = null;

const MIN_INTERVAL_MS = 10 * 60 * 1000; // 下限 10 分钟，防误配过频
const PER_TOPIC_GAP_MS = 3000; // 议题间错峰间隔

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveIntervalMs() {
  try {
    const config = await readSystemConfigRaw();
    const hours = Number(config?.product?.refreshIntervalHours);
    if (Number.isFinite(hours) && hours > 0) {
      return Math.max(MIN_INTERVAL_MS, hours * 3600 * 1000);
    }
  } catch {
    /* 配置不可读时用默认 */
  }
  return 3600 * 1000;
}

/** 跑一轮：为所有 active 议题串行 backfill */
export async function runAutoPullOnce() {
  if (running) return { skipped: "已有任务在执行" };
  running = true;
  const startedAt = new Date().toISOString();
  const results = [];
  try {
    const store = await readTopicsStore();
    const actives = store.topics.filter((t) => t.status === "active");
    for (const topic of actives) {
      try {
        const r = await backfillTopicSignals(topic.id);
        results.push({
          id: topic.id,
          title: topic.title,
          matched: r.matchedCount ?? 0,
          sources: r.intake?.sourceCount ?? 0,
          briefing: r.topic?.briefing?.available ? "ok" : (r.topic?.briefing?.reason || "n/a")
        });
      } catch (e) {
        results.push({ id: topic.id, title: topic.title, error: e.message });
      }
      await sleep(PER_TOPIC_GAP_MS);
    }
  } finally {
    running = false;
    lastRunAt = startedAt;
    lastResult = { startedAt, finishedAt: new Date().toISOString(), topics: results };
  }
  return lastResult;
}

/** 启动调度（server 启动时调用）。非阻塞，首轮延迟以避开启动高峰。 */
export async function startAutoPull() {
  if (String(process.env.TOPIC_AUTO_PULL || "").toLowerCase() === "off") {
    console.log("[topics] 自动拉取已关闭 (TOPIC_AUTO_PULL=off)");
    return;
  }
  if (timer) return;

  const intervalMs = await resolveIntervalMs();
  const FIRST_DELAY_MS = 60 * 1000; // 启动 1 分钟后跑首轮

  const tick = async () => {
    try {
      await runAutoPullOnce();
    } catch (e) {
      console.error("[topics] 自动拉取轮次失败:", e.message);
    }
  };

  setTimeout(tick, FIRST_DELAY_MS);
  timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  console.log(`[topics] 自动拉取已启动，间隔 ${Math.round(intervalMs / 60000)} 分钟（首轮 1 分钟后）`);
}

export function getAutoPullStatus() {
  return { running, lastRunAt, lastResult };
}
