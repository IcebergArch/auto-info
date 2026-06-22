import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";
import {
  detectOpenRouterKeySource,
  resolveOpenRouterApiKey,
  resolveOpenRouterModel,
  testOpenRouterModel
} from "../../shared/openrouter.mjs";
import { readEventStore, readReportStore } from "../../shared/store.mjs";
import { saveNeo4jGraph } from "../../shared/neo4j-graph.mjs";
import { nowIso } from "../../shared/utils.mjs";

const CONFIG_FILE = path.join(process.cwd(), "data", "system-config.json");

const DEFAULT_CONFIG = {
  version: 1,
  storage: {
    primary: "mysql",
    fallback: "json",
    mysql: {
      host: "127.0.0.1",
      port: 3306,
      database: "auto-info",
      user: "root",
      password: "",
      cliPath: "mysql"
    }
  },
  graph: {
    provider: "neo4j",
    neo4j: {
      host: "127.0.0.1",
      boltPort: 7687,
      httpPort: 7474,
      database: "neo4j",
      user: "neo4j",
      password: "",
      httpUrl: "http://127.0.0.1:7474"
    }
  },
  sources: {
    googleSearch: {
      enabled: false,
      endpoint: "https://www.googleapis.com/customsearch/v1",
      cx: "",
      apiKey: ""
    },
    braveSearch: {
      enabled: false,
      endpoint: "https://api.search.brave.com/res/v1/web/search",
      apiKey: ""
    },
    jinaReader: {
      enabled: true,
      endpoint: "https://r.jina.ai/",
      apiKey: ""
    },
    twitterSearch: {
      enabled: false,
      endpoint: "https://api.x.com/2/tweets/search/recent",
      bearerToken: ""
    }
  },
  llm: {
    provider: "openrouter",
    model: "openai/gpt-4.1-mini",
    apiKey: ""
  },
  product: {
    refreshIntervalHours: 1
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfig(base, incoming = {}) {
  const next = clone(base);
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = mergeConfig(next[key] || {}, value);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

function mask(value) {
  const raw = String(value || "");
  if (!raw) return "";
  if (raw.length <= 8) return `${raw.slice(0, 2)}...`;
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function stripMaskedSecrets(input, existing) {
  const next = clone(input || {});
  const pairs = [
    ["sources", "googleSearch", "apiKey"],
    ["sources", "braveSearch", "apiKey"],
    ["sources", "jinaReader", "apiKey"],
    ["sources", "twitterSearch", "bearerToken"],
    ["llm", null, "apiKey"],
    ["storage", "mysql", "password"],
    ["graph", "neo4j", "password"]
  ];

  for (const [top, mid, field] of pairs) {
    const target = mid ? next[top]?.[mid] : next[top];
    if (!target || !(field in target)) continue;
    const current = target[field];
    if (current === "" || String(current || "").includes("...")) {
      const oldValue = mid ? existing[top]?.[mid]?.[field] : existing[top]?.[field];
      target[field] = oldValue || "";
    }
  }
  return next;
}

async function publicConfig(config) {
  const out = clone(config);
  const resolvedApiKey = await resolveOpenRouterApiKey(config);
  out.storage.mysql.passwordMasked = mask(config.storage?.mysql?.password);
  delete out.storage.mysql.password;
  out.graph.neo4j.passwordMasked = mask(config.graph?.neo4j?.password);
  delete out.graph.neo4j.password;
  out.sources.googleSearch.apiKeyMasked = mask(config.sources?.googleSearch?.apiKey);
  delete out.sources.googleSearch.apiKey;
  out.sources.braveSearch.apiKeyMasked = mask(config.sources?.braveSearch?.apiKey);
  delete out.sources.braveSearch.apiKey;
  out.sources.jinaReader.apiKeyMasked = mask(config.sources?.jinaReader?.apiKey);
  delete out.sources.jinaReader.apiKey;
  out.sources.twitterSearch.bearerTokenMasked = mask(config.sources?.twitterSearch?.bearerToken);
  delete out.sources.twitterSearch.bearerToken;
  out.llm.apiKeyMasked = mask(resolvedApiKey);
  out.llm.modelResolved = resolveOpenRouterModel(config.llm?.model || "");
  if (out.llm.modelResolved === String(config.llm?.model || "").trim()) {
    delete out.llm.modelResolved;
  }
  delete out.llm.apiKey;
  return out;
}

async function ensureConfigFile() {
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  try {
    await fs.access(CONFIG_FILE);
  } catch {
    await fs.writeFile(CONFIG_FILE, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf-8");
  }
}

export async function readSystemConfigRaw() {
  await ensureConfigFile();
  const raw = await fs.readFile(CONFIG_FILE, "utf-8");
  return mergeConfig(DEFAULT_CONFIG, JSON.parse(raw));
}

export async function getSystemConfig() {
  return publicConfig(await readSystemConfigRaw());
}

export async function updateSystemConfig(input) {
  const existing = await readSystemConfigRaw();
  const cleaned = stripMaskedSecrets(input, existing);
  const next = mergeConfig(existing, cleaned);
  next.updatedAt = nowIso();
  await fs.mkdir(path.dirname(CONFIG_FILE), { recursive: true });
  await fs.writeFile(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`, "utf-8");
  return publicConfig(next);
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function mysqlArgs(mysql, sql) {
  const args = [
    "-h", mysql.host || "127.0.0.1",
    "-P", String(mysql.port || 3306),
    "-u", mysql.user || "root",
    "--default-character-set=utf8mb4",
    "-e", sql
  ];
  return args;
}

function runCommand(file, args, env = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { env: { ...process.env, ...env }, timeout: 8000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error, stdout, stderr });
        return;
      }
      resolve({ ok: true, stdout, stderr });
    });
  });
}

async function runMysql(mysql, sql) {
  const env = mysql.password ? { MYSQL_PWD: mysql.password } : {};
  return runCommand(mysql.cliPath || "mysql", mysqlArgs(mysql, sql), env);
}

async function checkMysql(mysql) {
  const result = await runMysql(mysql, "SELECT 1 AS ok;");
  if (result.ok) {
    return { primary: "mysql", status: "connected", message: "MySQL CLI 连接成功", detail: "mysql SELECT 1 ok" };
  }
  const message = result.error?.code === "ENOENT"
    ? "未找到 mysql CLI，请安装 MySQL client 或配置 cliPath"
    : (result.stderr || result.error?.message || "MySQL 连接失败").trim();
  return { primary: "mysql", status: "degraded", message, fallback: "json" };
}

function checkTcp(host, port, timeoutMs = 1600) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok, message) => {
      socket.destroy();
      resolve({ ok, message });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true, "connected"));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error) => done(false, error.message));
  });
}

async function checkNeo4j(neo4j) {
  const bolt = await checkTcp(neo4j.host || "127.0.0.1", Number(neo4j.boltPort || 7687));
  if (bolt.ok) {
    return { provider: "neo4j", status: "connected", message: "Neo4j Bolt 端口可达", detail: "bolt 7687 connected" };
  }

  try {
    const response = await fetch(`${neo4j.httpUrl || `http://${neo4j.host || "127.0.0.1"}:${neo4j.httpPort || 7474}`}/`);
    if (response.ok) {
      return { provider: "neo4j", status: "connected", message: "Neo4j HTTP 端口可达", detail: `HTTP ${response.status}` };
    }
  } catch {
    // fall through
  }

  return {
    provider: "neo4j",
    status: "degraded",
    message: `Neo4j 未连接：${bolt.message}`,
    fallback: "memory-graph"
  };
}

function sourceStatuses(config) {
  const google = config.sources?.googleSearch || {};
  const brave = config.sources?.braveSearch || {};
  const jina = config.sources?.jinaReader || {};
  const twitter = config.sources?.twitterSearch || {};
  return [
    {
      name: "googleSearch",
      status: google.enabled ? (google.apiKey ? "configured" : "free") : "missing",
      message: google.enabled
        ? (google.apiKey ? "Google Search 已启用（API 模式）" : "Google Search 已启用（免费模式：Google News RSS + GDELT）")
        : "Google Search 未启用"
    },
    {
      name: "braveSearch",
      status: brave.enabled ? (brave.apiKey ? "configured" : "missing") : "missing",
      message: brave.enabled
        ? (brave.apiKey ? "Brave Search 已启用（API 模式）" : "Brave Search 已启用但缺少 API Key")
        : "Brave Search 未启用"
    },
    {
      name: "jinaReader",
      status: jina.enabled ? (jina.apiKey ? "configured" : "free") : "missing",
      message: jina.enabled
        ? (jina.apiKey ? "Jina Reader 已启用（API 模式）" : "Jina Reader 已启用（免费模式）")
        : "Jina Reader 未启用"
    },
    {
      name: "twitterSearch",
      status: twitter.enabled ? (twitter.bearerToken ? "configured" : "free") : "missing",
      message: twitter.enabled
        ? (twitter.bearerToken ? "Twitter/X Search 已启用（API 模式）" : "Twitter/X Search 已启用（免费模式：Nitter RSS）")
        : "Twitter/X Search 未启用"
    }
  ];
}

export async function getSystemStatus() {
  const config = await readSystemConfigRaw();
  const [storage, graph] = await Promise.all([
    checkMysql(config.storage.mysql),
    checkNeo4j(config.graph.neo4j)
  ]);

  const [llmKey, keySource] = await Promise.all([
    resolveOpenRouterApiKey(config),
    detectOpenRouterKeySource(config)
  ]);
  const configuredModel = String(config.llm?.model || "").trim();
  const resolvedModel = resolveOpenRouterModel(configuredModel);
  return {
    generatedAt: nowIso(),
    storage,
    graph,
    sources: sourceStatuses(config),
    llm: {
      provider: config.llm?.provider || "openrouter",
      model: configuredModel,
      modelResolved: resolvedModel !== configuredModel ? resolvedModel : undefined,
      keySource,
      status: llmKey ? "configured" : "missing",
      message: llmKey
        ? `LLM key 已配置（来源：${keySource}，已掩码）`
        : "LLM key 未配置（可写入系统配置、OPENROUTER_API_KEY 或 macOS Keychain: openrouter-api-key）"
    }
  };
}

export async function testLlmConnectivity(input = {}) {
  const config = await readSystemConfigRaw();
  const apiKey = await resolveOpenRouterApiKey(config);
  if (!apiKey) {
    return {
      ok: false,
      status: "missing",
      message: "LLM key 未配置"
    };
  }

  const requestedModel = String(input.model || config.llm?.model || "openai/gpt-4.1-mini").trim();
  return testOpenRouterModel(apiKey, requestedModel, requestedModel);
}

async function syncMysql(config) {
  const mysql = config.storage.mysql;
  const eventStore = await readEventStore();
  const reportStore = await readReportStore();
  const db = mysql.database || "auto-info";

  const ddl = `
CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${db}\`;
CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(160) PRIMARY KEY,
  title TEXT NOT NULL,
  category VARCHAR(80),
  region VARCHAR(160),
  severity INT,
  special TINYINT,
  occurred_at DATETIME,
  tags JSON,
  summary TEXT,
  payload JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS daily_reports (
  date_key VARCHAR(10) PRIMARY KEY,
  title TEXT,
  stored_at DATETIME,
  review_status VARCHAR(80),
  payload JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS query_history (
  id VARCHAR(180) PRIMARY KEY,
  query_text TEXT,
  result_title TEXT,
  payload JSON,
  created_at DATETIME
);`;

  const result = await runMysql(mysql, ddl);
  if (result.ok) {
    const chunkSize = 80;
    const chunks = (items) => {
      const out = [];
      for (let i = 0; i < items.length; i += chunkSize) out.push(items.slice(i, i + chunkSize));
      return out;
    };
    const eventStatements = eventStore.events.map((event) => `
REPLACE INTO events (id, title, category, region, severity, special, occurred_at, tags, summary, payload)
VALUES (${sqlString(event.id)}, ${sqlString(event.title)}, ${sqlString(event.category)}, ${sqlString(event.region)}, ${Number(event.severity || 0)}, ${event.special ? 1 : 0}, ${sqlString(event.occurredAt?.slice(0, 19).replace("T", " "))}, CAST(${sqlString(JSON.stringify(event.tags || []))} AS JSON), ${sqlString(event.summary)}, NULL);`);
    const reportStatements = reportStore.reports.map((item) => `
REPLACE INTO daily_reports (date_key, title, stored_at, review_status, payload)
VALUES (${sqlString(item.date)}, ${sqlString(item.report?.title)}, ${sqlString(item.storedAt?.slice(0, 19).replace("T", " "))}, ${sqlString(item.report?.review?.status)}, NULL);`);
    const historyStatements = (eventStore.queryHistory || []).map((item) => `
REPLACE INTO query_history (id, query_text, result_title, payload, created_at)
VALUES (${sqlString(item.id)}, ${sqlString(item.query)}, ${sqlString(item.resultTitle)}, NULL, ${sqlString(item.createdAt?.slice(0, 19).replace("T", " "))});`);
    for (const part of [...chunks(eventStatements), ...chunks(reportStatements), ...chunks(historyStatements)]) {
      if (!part.length) continue;
      const batchResult = await runMysql(mysql, `USE \`${db}\`;\n${part.join("\n")}`);
      if (!batchResult.ok) {
        return {
          status: "degraded",
          message: batchResult.error?.code === "ENOENT" ? "未找到 mysql CLI，无法同步 MySQL" : (batchResult.stderr || batchResult.error?.message || "MySQL 同步失败").trim(),
          fallback: "json"
        };
      }
    }
    return {
      status: "connected",
      message: `已同步 ${eventStore.events.length} 个事件、${reportStore.reports.length} 份日报、${(eventStore.queryHistory || []).length} 条咨询历史到 MySQL`
    };
  }
  return {
    status: "degraded",
    message: result.error?.code === "ENOENT" ? "未找到 mysql CLI，无法同步 MySQL" : (result.stderr || result.error?.message || "MySQL 同步失败").trim(),
    fallback: "json"
  };
}

async function syncNeo4j(config) {
  const neo4j = config.graph.neo4j;
  const status = await checkNeo4j(neo4j);
  if (status.status !== "connected") return status;
  if (!neo4j.user || !neo4j.password) {
    return {
      status: "degraded",
      message: "Neo4j 端口可达，但未配置账号密码；已保持本地内存图谱降级",
      fallback: "memory-graph"
    };
  }

  const eventStore = await readEventStore();
  const nodes = eventStore.events.map((event) => ({
    id: event.id,
    title: event.title,
    summary: event.summary,
    tags: event.tags || [],
    severity: event.severity,
    category: event.category || "未分类",
    region: event.region || "全球",
    occurredAt: event.occurredAt,
    level: event.special || Number(event.severity || 0) >= 85 ? "core" : "important",
    dimension: "market",
    depth: 2,
    impacts: event.impacts || []
  }));

  const saveResult = await saveNeo4jGraph(nodes, []);
  if (!saveResult.ok) {
    return {
      status: "degraded",
      message: saveResult.reason || "Neo4j 同步失败",
      fallback: "memory-graph"
    };
  }
  const dbNote = saveResult.databaseFallback ? `（库名已回退 ${saveResult.databaseFallback}）` : "";
  return {
    status: "connected",
    message: `已同步 ${nodes.length} 个事件节点与标签关系到 Neo4j${dbNote}`
  };
}

export async function syncSystemLinks() {
  const config = await readSystemConfigRaw();
  const [mysql, neo4j] = await Promise.all([
    syncMysql(config),
    syncNeo4j(config)
  ]);
  return { ok: mysql.status === "connected" || neo4j.status === "connected", syncedAt: nowIso(), mysql, neo4j };
}
