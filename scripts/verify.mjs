import { spawn, execSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.VERIFY_PORT || 4317);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHECK_FILES = [
  "server.mjs",
  "services/api/src/server.mjs",
  "services/api/src/use-cases/uc-001-daily-events/routes.mjs",
  "services/api/src/use-cases/uc-001-daily-events/intake.mjs",
  "services/api/src/use-cases/uc-001-daily-events/intake-match.mjs",
  "services/api/src/use-cases/uc-001-daily-events/news-sources.mjs",
  "services/api/src/use-cases/uc-002-event-analysis/routes.mjs",
  "services/api/src/use-cases/uc-003-reading-assistant/routes.mjs",
  "services/api/src/use-cases/uc-003-reading-assistant/summary.mjs",
  "services/api/src/use-cases/uc-003-reading-assistant/chinese-brief.mjs",
  "services/api/src/use-cases/uc-003-reading-assistant/llm-summarize.mjs",
  "services/api/src/use-cases/uc-004-system-config/routes.mjs",
  "services/api/src/use-cases/uc-005-quick-access/routes.mjs",
  "services/api/src/use-cases/uc-005-quick-access/embed-proxy.mjs",
  "services/api/src/use-cases/uc-006-tech-radar/routes.mjs",
  "services/api/src/use-cases/uc-006-tech-radar/service.mjs",
  "services/api/src/use-cases/uc-006-tech-radar/store.mjs"
];

// 新增/变更 API 时须同步添加冒烟项 — 见 spec/constraints/FEATURE-TESTING.md
const SMOKE_ENDPOINTS = [
  { method: "GET", path: "/", expect: 200 },
  { method: "GET", path: "/api/v1/daily-events/today", expect: 200 },
  { method: "GET", path: "/api/v1/daily-events/report", expect: 200 },
  { method: "POST", path: "/api/v1/daily-events/report/store", expect: 200, body: {} },
  { method: "POST", path: "/api/v1/daily-events/report/update", expect: 200, body: { pullSources: false } },
  { method: "POST", path: "/api/v1/daily-events/report/backfill", expect: 200, body: { from: "2026-05-27", to: "2026-05-27", pullSources: false } },
  { method: "GET", path: "/api/v1/daily-events/reports", expect: 200 },
  { method: "GET", path: "/api/v1/daily-events/search-history", expect: 200 },
  { method: "GET", path: "/api/v1/daily-events/focus", expect: 200 },
  { method: "GET", path: "/api/v1/analysis/tags", expect: 200 },
  { method: "GET", path: "/api/v1/analysis/history", expect: 200 },
  { method: "GET", path: "/api/v1/reading-assistant/history", expect: 200 },
  { method: "GET", path: "/api/v1/tech-radar/feed", expect: 200 },
  {
    method: "POST",
    path: "/api/v1/tech-radar/backfill",
    expect: 200,
    body: { fromMonth: "2025-12", toMonth: "2025-12" }
  },
  {
    method: "POST",
    path: "/api/v1/tech-radar/repair-archives",
    expect: 200,
    body: { force: false }
  },
  { method: "GET", path: "/api/v1/config", expect: 200 },
  { method: "GET", path: "/api/v1/config/status", expect: 200 },
  {
    method: "POST",
    path: "/api/v1/daily-events/intake",
    expect: 200,
    body: { query: "测试类目检索", category: "科技" }
  }
];

function log(step, message) {
  console.log(`[verify] ${step}: ${message}`);
}

function syntaxCheck() {
  log("syntax", "checking .mjs files");
  for (const file of CHECK_FILES) {
    execSync(`node --check "${file}"`, { cwd: ROOT, stdio: "pipe" });
  }
}

async function fetchStatus(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  return response.status;
}

async function waitForServer(child, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await fetchStatus(`http://${HOST}:${PORT}/`).catch(() => null);
    if (status === 200) return;
    await delay(200);
  }
  throw new Error(`服务在 ${timeoutMs}ms 内未就绪 (http://${HOST}:${PORT})`);
}

async function smokeTest() {
  for (const item of SMOKE_ENDPOINTS) {
    const url = `http://${HOST}:${PORT}${item.path}`;
    const status = await fetchStatus(url, item.method, item.body);
    if (status !== item.expect) {
      throw new Error(`${item.method} ${item.path} 期望 ${item.expect}，实际 ${status}`);
    }
    log("ok", `${item.method} ${item.path} -> ${status}`);
  }
}

async function assertApiHealth(url) {
  log("health", `check API root: ${url}`);
  const response = await fetch(url);
  const body = await response.text();
  if (response.status !== 200) {
    throw new Error(`API 健康检查失败：${url} -> ${response.status}`);
  }
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`API 根路径应返回 JSON，实际非 JSON：${url}`);
  }
  if (payload?.service !== "auto-info-api" || payload?.status !== "ok") {
    throw new Error(`API 健康检查内容异常：${url}`);
  }
  log("health", `ok: ${url}`);
}

async function assertServerAlive(child, durationMs = 3000, intervalMs = 500) {
  log("alive-check", `持续探测 ${durationMs}ms，确认服务未被关闭`);
  const started = Date.now();
  while (Date.now() - started < durationMs) {
    if (child.exitCode !== null) {
      throw new Error(`服务进程异常退出，exit code=${child.exitCode}`);
    }
    const status = await fetchStatus(`http://${HOST}:${PORT}/`).catch(() => null);
    if (status !== 200) {
      throw new Error(`服务存活探测失败，GET / 返回 ${status ?? "连接失败"}`);
    }
    await delay(intervalMs);
  }
  log("alive-check", "通过，服务持续可用");
}

function runStructureAudit() {
  log("audit", "directory structure");
  execSync("node scripts/audit-structure.mjs", { cwd: ROOT, stdio: "inherit" });
}

async function main() {
  runStructureAudit();
  syntaxCheck();

  log("start", `PORT=${PORT}`);
  const child = spawn("node", ["server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(child);
    await smokeTest();
    await assertApiHealth(`http://${HOST}:${PORT}/`);
    await assertServerAlive(child);
    log("done", "项目可正常启动，核心接口无报错");
    log("hint", "新功能改动后请再执行: npm run test:features");
  } catch (error) {
    console.error(stderr);
    throw error;
  } finally {
    child.kill("SIGTERM");
    await delay(300);
  }
}

main().catch((error) => {
  console.error(`[verify] FAILED: ${error.message}`);
  process.exit(1);
});
