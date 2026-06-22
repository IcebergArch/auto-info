import { createServer } from "node:http";
import { URL } from "node:url";
import { sendJson } from "./shared/http.mjs";
import { handleDailyEvents } from "./use-cases/uc-001-daily-events/routes.mjs";
import { handleEventAnalysis } from "./use-cases/uc-002-event-analysis/routes.mjs";
import { handleReadingAssistant } from "./use-cases/uc-003-reading-assistant/routes.mjs";
import { handleSystemConfig } from "./use-cases/uc-004-system-config/routes.mjs";
import { handleQuickAccess } from "./use-cases/uc-005-quick-access/routes.mjs";
import { handleTechRadar } from "./use-cases/uc-006-tech-radar/routes.mjs";
import { handleTopics } from "./use-cases/uc-007-topics/routes.mjs";
import { startAutoPull } from "./use-cases/uc-007-topics/scheduler.mjs";
import { handleLocalDevProxy } from "./shared/local-dev-proxy.mjs";

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "127.0.0.1";

async function handleApi(req, res, requestUrl) {
  const { pathname, searchParams } = requestUrl;
  const method = req.method || "GET";

  const handlers = [
    handleDailyEvents,
    handleEventAnalysis,
    handleReadingAssistant,
    handleSystemConfig,
    handleQuickAccess,
    handleTechRadar,
    handleTopics
  ];
  for (const handler of handlers) {
    const handled = await handler(req, res, pathname, searchParams, method);
    if (handled !== false) return;
  }

  return sendJson(res, 404, { error: "未找到 API 路由" });
}

function handleNonApi(res, pathname) {
  if (pathname === "/") {
    return sendJson(res, 200, {
      service: "auto-info-api",
      status: "ok",
      // 版本探针：访问 http://127.0.0.1:4173/ 看到此值即说明跑的是带"代理人三维研判"的新代码
      buildTag: "agent-3dim-briefing-2026-06-18",
      ui: "apps/web-react (dev default http://localhost:5174)"
    });
  }
  return sendJson(res, 404, {
    error: "未找到路由",
    hint: "后端仅提供 /api/* 与 GET / 健康检查；请访问前端 dev 服务"
  });
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (handleLocalDevProxy(req, res, requestUrl.pathname, requestUrl.searchParams)) {
      return;
    }
    if (requestUrl.pathname.startsWith("/api/")) {
      await handleApi(req, res, requestUrl);
      return;
    }
    handleNonApi(res, requestUrl.pathname);
  } catch (error) {
    sendJson(res, 500, { error: "服务异常", detail: error.message });
  }
});

function listenWithFallback(startPort, maxAttempts = 10) {
  let activePort = startPort;
  let attempts = 0;
  let started = false;

  const tryListen = () => {
    server.listen(activePort, HOST);
  };

  server.on("listening", () => {
    if (started) return;
    started = true;
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : activePort;
    console.log(`Auto-info API running on http://${HOST}:${port}`);
    console.log("STDD use-cases: UC-001 daily-events | UC-002 analysis | UC-003 reading-assistant");
    // 烛龙·情报：启动自动拉取调度（非阻塞，可用 TOPIC_AUTO_PULL=off 关闭）
    void startAutoPull();
  });

  server.on("error", (error) => {
    if ((error.code === "EADDRINUSE" || error.code === "EPERM") && attempts < maxAttempts - 1) {
      attempts += 1;
      activePort += 1;
      console.warn(`Port ${activePort - 1} unavailable (${error.code}), retrying ${activePort}...`);
      setTimeout(tryListen, 100);
      return;
    }
    console.error(`Failed to start server: ${error.code || "UNKNOWN"} ${error.message}`);
    process.exit(1);
  });

  tryListen();
}

listenWithFallback(PORT);
