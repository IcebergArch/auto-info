import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeEvent } from "./event-model.mjs";
import { windowSinceDays } from "../use-cases/uc-002-event-analysis/analysis-window.mjs";

const CONFIG_FILE = path.join(process.cwd(), "data", "system-config.json");

function runCommand(file, args, env = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { env: { ...process.env, ...env }, timeout: 9000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false, error, stdout, stderr });
        return;
      }
      resolve({ ok: true, stdout, stderr });
    });
  });
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

async function readMysqlConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(raw);
    const mysql = config?.storage?.mysql || {};
    return {
      cliPath: mysql.cliPath || "mysql",
      host: mysql.host || "127.0.0.1",
      port: Number(mysql.port || 3306),
      user: mysql.user || "root",
      password: mysql.password || "",
      database: mysql.database || "auto-info"
    };
  } catch {
    return {
      cliPath: "mysql",
      host: "127.0.0.1",
      port: 3306,
      user: "root",
      password: "",
      database: "auto-info"
    };
  }
}

function mysqlArgs(mysql, sql) {
  return [
    "-h", mysql.host,
    "-P", String(mysql.port),
    "-u", mysql.user,
    "--default-character-set=utf8mb4",
    "-N",
    "-B",
    "-D", mysql.database,
    "-e", sql
  ];
}

export async function upsertEventsToMysql(events) {
  if (!Array.isArray(events) || !events.length) return { ok: true, upserted: 0, status: "skipped" };
  const mysql = await readMysqlConfig();
  const env = mysql.password ? { MYSQL_PWD: mysql.password } : {};
  const sql = events.map((event) => `
REPLACE INTO events (id, title, category, region, severity, special, occurred_at, tags, summary, payload)
VALUES (
  ${sqlString(event.id)},
  ${sqlString(event.title)},
  ${sqlString(event.category || "未分类")},
  ${sqlString(event.region || "全球")},
  ${Number(event.severity || 0)},
  ${event.special ? 1 : 0},
  ${sqlString(String(event.occurredAt || "").slice(0, 19).replace("T", " "))},
  CAST(${sqlString(JSON.stringify(event.tags || []))} AS JSON),
  ${sqlString(event.summary || "")},
  CAST(${sqlString(JSON.stringify(event))} AS JSON)
);`).join("\n");
  const result = await runCommand(mysql.cliPath, mysqlArgs(mysql, sql), env);
  if (!result.ok) {
    return { ok: false, status: "degraded", message: (result.stderr || result.error?.message || "mysql upsert failed").trim() };
  }
  return { ok: true, upserted: events.length, status: "connected" };
}

export async function recallEventsFromMysql(query, limit = 30) {
  const mysql = await readMysqlConfig();
  const env = mysql.password ? { MYSQL_PWD: mysql.password } : {};
  const q = String(query || "").trim();
  if (!q) return { ok: true, events: [], source: "mysql" };
  const sinceDays = Math.max(365, Math.min(365 * 5, windowSinceDays(q)));
  const maxRows = Math.max(1, Math.min(80, Number(limit || 30)));
  const like = `%${q}%`;
  const sql = `
SELECT JSON_OBJECT(
  'id', id,
  'title', title,
  'category', category,
  'region', region,
  'severity', severity,
  'special', IFNULL(special, 0),
  'occurredAt', DATE_FORMAT(occurred_at, '%Y-%m-%dT%H:%i:%s.000Z'),
  'tags', tags,
  'summary', summary,
  'impacts', JSON_EXTRACT(payload, '$.impacts'),
  'timeline', JSON_EXTRACT(payload, '$.timeline'),
  'references', JSON_EXTRACT(payload, '$.references')
) AS row_json
FROM events
WHERE occurred_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${sinceDays} DAY)
  AND (
    title LIKE ${sqlString(like)}
    OR summary LIKE ${sqlString(like)}
    OR category LIKE ${sqlString(like)}
    OR region LIKE ${sqlString(like)}
    OR JSON_SEARCH(tags, 'one', ${sqlString(q)}) IS NOT NULL
  )
ORDER BY severity DESC, occurred_at DESC
LIMIT ${maxRows};`;
  const result = await runCommand(mysql.cliPath, mysqlArgs(mysql, sql), env);
  if (!result.ok) {
    return {
      ok: false,
      events: [],
      source: "memory",
      message: (result.stderr || result.error?.message || "mysql recall failed").trim()
    };
  }
  const events = String(result.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        const raw = JSON.parse(line);
        return normalizeEvent({
          ...raw,
          tags: Array.isArray(raw.tags) ? raw.tags : [],
          impacts: Array.isArray(raw.impacts) ? raw.impacts : [],
          timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
          references: Array.isArray(raw.references) ? raw.references : []
        }, index);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return { ok: true, events, source: "mysql" };
}
