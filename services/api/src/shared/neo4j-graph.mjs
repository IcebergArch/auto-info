import { promises as fs } from "node:fs";
import path from "node:path";
import { resolveAnalysisWindow } from "../use-cases/uc-002-event-analysis/analysis-window.mjs";
import { graphQueryTerms } from "../use-cases/uc-002-event-analysis/match-query.mjs";

const CONFIG_FILE = path.join(process.cwd(), "data", "system-config.json");

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function neo4jFromConfig(config) {
  const neo4j = config?.graph?.neo4j || {};
  return {
    host: neo4j.host || "127.0.0.1",
    httpPort: Number(neo4j.httpPort || 7474),
    database: neo4j.database || "neo4j",
    user: neo4j.user || "neo4j",
    password: neo4j.password || process.env.NEO4J_PASSWORD || "",
    httpUrl: neo4j.httpUrl || ""
  };
}

function isDatabaseNotFound(payload) {
  return Array.isArray(payload.errors)
    && payload.errors.some((item) => String(item.code || "").includes("DatabaseNotFound"));
}

async function runNeo4jStatements(statements, databaseOverride) {
  const config = await readConfig();
  const neo4j = neo4jFromConfig(config);
  if (!neo4j.user || !neo4j.password) {
    return { ok: false, reason: "missing-auth" };
  }
  const base = neo4j.httpUrl || `http://${neo4j.host}:${neo4j.httpPort}`;
  const databases = Array.from(new Set([
    databaseOverride || neo4j.database || "neo4j",
    "neo4j"
  ]));
  let lastReason = "neo4j-unavailable";
  for (const database of databases) {
    const endpoint = `${base}/db/${encodeURIComponent(database)}/tx/commit`;
    const auth = Buffer.from(`${neo4j.user}:${neo4j.password}`).toString("base64");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ statements })
      });
      const payload = await response.json().catch(() => ({}));
      const hasErrors = Array.isArray(payload.errors) && payload.errors.length > 0;
      if (!response.ok || hasErrors) {
        lastReason = payload.errors?.[0]?.message || `HTTP ${response.status}`;
        if (isDatabaseNotFound(payload) && database !== "neo4j") {
          continue;
        }
        return { ok: false, reason: lastReason, database };
      }
      return {
        ok: true,
        results: payload.results || [],
        database,
        databaseFallback: database !== (neo4j.database || "neo4j") ? "neo4j" : undefined
      };
    } catch (error) {
      lastReason = error.message;
    }
  }
  return { ok: false, reason: lastReason };
}

export async function probeNeo4j() {
  const result = await runNeo4jStatements([{ statement: "RETURN 1 AS ok" }]);
  return {
    ok: result.ok,
    reason: result.reason,
    database: result.database,
    databaseFallback: result.databaseFallback
  };
}

export async function queryNeo4jGraph(query) {
  const { startTs } = resolveAnalysisWindow(query);
  const startIso = new Date(startTs).toISOString();
  const terms = graphQueryTerms(query).map((term) => term.toLowerCase());
  const statement = {
    statement: `
      MATCH (e:Event)
      WHERE datetime(coalesce(e.occurredAt, "1970-01-01T00:00:00Z")) >= datetime($startIso)
        AND ANY(term IN $terms WHERE toLower(coalesce(e.searchText, "")) CONTAINS term)
      OPTIONAL MATCH (e)-[r:RELATED_TO]-(o:Event)
      RETURN
        collect(DISTINCT {
          id: e.id,
          title: e.title,
          summary: e.summary,
          tags: e.tags,
          severity: e.severity,
          category: e.category,
          region: e.region,
          occurredAt: e.occurredAt,
          level: e.level,
          dimension: e.dimension,
          depth: e.depth,
          impacts: coalesce(e.impactsJson, "[]")
        }) AS nodes,
        collect(DISTINCT CASE WHEN r IS NULL THEN NULL ELSE {
          from: startNode(r).id,
          to: endNode(r).id,
          type: r.type,
          label: r.label,
          tone: r.tone,
          weight: r.weight,
          dimension: r.dimension,
          influence: r.influence
        } END) AS edges
    `,
    parameters: { terms, startIso }
  };
  const result = await runNeo4jStatements([statement]);
  if (!result.ok) return { ok: false, reason: result.reason };
  const row = result.results?.[0]?.data?.[0]?.row;
  const nodes = Array.isArray(row?.[0]) ? row[0].filter(Boolean) : [];
  const edges = Array.isArray(row?.[1]) ? row[1].filter(Boolean) : [];
  return { ok: true, nodes, edges, database: result.database };
}

export async function saveNeo4jGraph(nodes, edges) {
  const eventRows = nodes.map((node) => ({
    id: node.id,
    title: node.title,
    summary: node.summary,
    tags: (node.tags || []).map((tag) => String(tag)),
    severity: Number(node.severity || 0),
    category: node.category || "未分类",
    region: node.region || "全球",
    occurredAt: node.occurredAt || null,
    level: node.level || "important",
    dimension: node.dimension || "market",
    depth: Number(node.depth || 2),
    impactsJson: JSON.stringify(node.impacts || []),
    searchText: `${node.title || ""} ${node.summary || ""} ${node.category || ""} ${node.region || ""} ${(node.tags || []).join(" ")}`
  }));
  const tagPairs = nodes.flatMap((node) => (node.tags || []).map((tag) => ({ eventId: node.id, tag })));
  const edgeRows = edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    type: edge.type,
    label: edge.label,
    tone: edge.tone,
    weight: Number(edge.weight || 1),
    dimension: edge.dimension || "market",
    influence: edge.influence || ""
  }));
  const statements = [
    {
      statement: `
        UNWIND $events AS event
        MERGE (e:Event {id: event.id})
        SET e += event
      `,
      parameters: { events: eventRows }
    },
    {
      statement: `
        UNWIND $pairs AS pair
        MATCH (e:Event {id: pair.eventId})
        MERGE (t:Tag {name: pair.tag})
        MERGE (e)-[:TAGGED_AS]->(t)
      `,
      parameters: { pairs: tagPairs }
    },
    {
      statement: `
        UNWIND $edges AS edge
        MATCH (a:Event {id: edge.from})
        MATCH (b:Event {id: edge.to})
        MERGE (a)-[r:RELATED_TO {type: edge.type, label: edge.label}]->(b)
        SET r.tone = edge.tone,
            r.weight = edge.weight,
            r.dimension = edge.dimension,
            r.influence = edge.influence
      `,
      parameters: { edges: edgeRows }
    }
  ];
  const result = await runNeo4jStatements(statements);
  if (!result.ok) return result;
  return {
    ok: true,
    nodes: nodes.length,
    edges: edges.length,
    database: result.database,
    databaseFallback: result.databaseFallback
  };
}
