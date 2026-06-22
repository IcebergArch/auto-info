# API-UC-002：事件标签关联分析

Base: `/api/v1/analysis`

## GET /tags

返回事件库中去重后的全部标签及每个标签关联的事件数。

**Response 200:**

```json
{
  "tags": [{ "name": "重大", "eventCount": 3 }]
}
```

## GET /analyze（推荐）/graph（兼容）

**Query:**  
- `query` — 主事件主题（必填）  
- `secondaryQuery` — 次事件主题（可选，用于交叉影响）  
- `coreOnly` — 是否仅返回核心脉络（`1|0`，默认 `1`）  
- ~~`years`~~ — **已废弃**（忽略客户端传入值）；时间窗由服务端按主题自动推断（默认近 3 年；俄乌等长周期主题自 2014 起）  
- `tags` — 兼容旧参数（可选）

**Response 200:**

```json
{
  "query": "俄乌冲突",
  "secondaryQuery": "能源价格",
  "coreOnly": true,
  "graphSource": "neo4j",
  "matchMode": "direct",
  "recallSource": "mysql",
  "recallCount": 12,
  "ingestion": {
    "mysqlUpserted": 6,
    "mysqlStatus": "connected"
  },
  "tags": ["重大", "供应链"],
  "intel": {
    "queries": ["俄乌冲突", "Ukraine Russia war sanctions energy"],
    "articlesIngested": 4,
    "seedsUpserted": 6,
    "matched": 8
  },
  "eventLines": {
    "timeRange": { "start": "2014-02-01T00:00:00.000Z", "end": "2026-05-29T12:00:00.000Z" },
    "width": 1000,
    "height": 432,
    "laneHeight": 72,
    "lanes": [
      {
        "id": "intel-ru-ua-2022-invade",
        "label": "2022 全面军事行动",
        "y": 36,
        "points": [{ "id": "...", "at": "2022-02-24T00:00:00.000Z", "title": "...", "x": 420, "y": 36 }]
      }
    ],
    "influences": [
      { "id": "inf-a-b", "x1": 200, "y1": 36, "x2": 500, "y2": 108, "weight": 3, "tone": "negative", "label": "..." }
    ],
    "totalLanes": 6,
    "totalPoints": 12,
    "totalInfluences": 5
  },
  "chronology": {
    "query": "俄乌冲突",
    "timeRange": { "start": "2022-02-24T00:00:00.000Z", "end": "2026-05-29T12:00:00.000Z" },
    "totalPoints": 12,
    "phases": [
      {
        "phase": "background",
        "label": "背景与起因",
        "from": "...",
        "to": "...",
        "items": [{ "at": "2014-02-20T00:00:00.000Z", "title": "...", "text": "...", "level": "core" }]
      }
    ]
  },
  "storyline": [
    { "id": "e1", "occurredAt": "2024-01-10T00:00:00.000Z", "level": "core", "title": "...", "severity": 91 }
  ],
  "nodes": [
    {
      "id": "chip-export",
      "title": "...",
      "summary": "...",
      "tags": [],
      "severity": 94,
      "category": "科技",
      "dimension": "policy",
      "depth": 1,
      "impacts": [["policy", "政策传导", "..."]]
    }
  ],
  "edges": [
    {
      "from": "chip-export",
      "to": "red-sea-shipping",
      "type": "shared_tag",
      "label": "共享标签：供应链",
      "tone": "negative",
      "weight": 3,
      "dimension": "risk",
      "influence": "两条事件均涉及供应链成本与交付节奏，可能叠加扰动。"
    }
    {
      "from": "e1",
      "to": "e2",
      "type": "cross_impact",
      "label": "交叉影响：能源价格",
      "tone": "negative",
      "weight": 4,
      "dimension": "market",
      "influence": "主事件与次事件在能源供给与价格传导链条形成放大效应。"
    }
  ],
  "totalNodes": 2,
  "totalEdges": 1
}
```

`graphSource`：`neo4j | memory`（Neo4j 写入成功时为 `neo4j`）  
`neo4j`：`{ synced: boolean, reason?: string, nodes?: number, edges?: number, verified?: boolean }`  
`matchMode`：`direct | fallback`  
`recallSource`：`mysql | memory`

**Level types:** `core` | `important` | `context`  
**Edge types:** `shared_tag` | `same_category` | `impact_theme` | `keyword_overlap` | `cross_impact`

时间窗口约定：
- 首页触发的核心事件检索使用 intake 新鲜度窗口，与分析模块时间窗无关。
- 分析页可继续使用 1~5 年窗口进行深挖。

`chronology` 约定：
- 必须返回 `timeRange.start` / `timeRange.end`（起止时间）。
- 必须返回 `timeAxis`：`mode: "history-short-recent-long"`，`historyWidth`≈0.26，`recentWidth`≈0.74，`recentStart` 为近期展开起点。
- `phases` 按「背景 → 爆发 → 过程核心 → 重大变动 → 进展 → 近期变化」分组；历史时期条目较少（年/半年粒度），近期条目更密（周/日粒度），近期阶段条目上限高于历史阶段。

`eventLines.timeAxis` 与 `chronology.timeAxis` 使用同一非线性时间映射：历史短、近期长。
- 当事件库时间线不足时，可对已知地缘冲突主题注入参考脉络点（`synthetic: true`），并在前端标注。

## POST /graph

Body: `{ "query": "AI 芯片", "tags": ["重大"] }` — 与 GET 等价。

## GET /history

返回已保存的分析会话列表（不含完整 `result`，仅预览字段）。**同主事件且无 `secondaryQuery` 仅一条**；`query + secondaryQuery` 组合各自独立。

**Query:** `limit`（默认 `50`）

**Response 200:**

```json
{
  "items": [
    {
      "sessionId": "analysis-俄乌冲突",
      "query": "俄乌冲突",
      "secondaryQuery": "",
      "coreOnly": true,
      "preview": "2022-02-24 → 2026-05-29 · 12 个节点",
      "createdAt": "2026-05-29T12:00:00.000Z",
      "updatedAt": "2026-05-29T18:00:00.000Z"
    }
  ],
  "total": 1
}
```

会话键：`normalize(query)`；若 `secondaryQuery` 非空则为 `normalize(query)::normalize(secondaryQuery)`。重复分析同键时 **upsert**（`sessionId` 不变，`updatedAt` 刷新）。

## GET /sessions/:sessionId

按 `sessionId` 返回完整分析结果（含 `result`，结构与 `/analyze` 响应一致）。

**Response 200:** `{ "sessionId", "query", "secondaryQuery", "coreOnly", "preview", "yearSpan", "mainPointCount", "createdAt", "result": { ... } }`  
**Response 404:** `{ "error": "会话不存在" }`

`/analyze` 与 `/graph` 成功响应在原有字段基础上增加 `sessionId`（本次写入的历史 ID）。
