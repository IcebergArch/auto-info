# API：UC-006 科技雷达

Base path: `/api/v1/tech-radar`

## GET /feed

查询参数：

| 参数 | 说明 |
|------|------|
| `entryId` | 可选；指定时 `relatedMaterials` 为该条目 `sources` |

响应 `200`：

```json
{
  "timeline": [
    {
      "kind": "month",
      "id": "tr-month-2026-06",
      "label": "6月",
      "periodStart": "2026-06-01",
      "periodEnd": "2026-06-30",
      "defaultExpanded": true,
      "children": [{ "kind": "entry", "id": "tech-cursor-loop-2026-06-01", "entry": {} }]
    },
    {
      "kind": "year",
      "id": "tr-year-2025",
      "label": "2025年",
      "defaultExpanded": false,
      "children": []
    }
  ],
  "recent": [
    {
      "id": "tech-cursor-loop-2026-06-01",
      "term": "cursor loop",
      "title": "cursor: loop 功能",
      "brief": "Agent 定时唤醒与自调度，支持固定周期与动态心跳。",
      "status": "open",
      "granularity": "day",
      "occurredAt": "2026-06-01T10:00:00.000Z",
      "tags": ["Agent", "Cursor"],
      "briefingSessionId": null,
      "sources": []
    }
  ],
  "archives": [
    {
      "id": "tech-month-2026-05",
      "term": "2026-05",
      "title": "工程共识、LLM 能力提升、影视新模型、现象级产品",
      "brief": "五月 AI 工程与产品格局综述。",
      "status": "archived",
      "granularity": "month",
      "occurredAt": "2026-05-01T00:00:00.000Z",
      "detailBlocks": [
        { "label": "工程", "body": "Harness 与 agent 编排讨论升温…" }
      ],
      "sources": [
        { "title": "示例博客", "url": "https://example.com", "provider": "web" }
      ]
    }
  ],
  "relatedMaterials": [],
  "selectedEntryId": null,
  "refreshIntervalHours": 1,
  "lastRefreshedAt": "2026-06-01T12:00:00.000Z",
  "refreshCutoff": {
    "id": "tech-radar-refresh-cutoff-2026-06-01",
    "at": "2026-06-01T12:00:00.000Z",
    "isRefreshCutoff": true,
    "title": "上次更新",
    "desc": "以下 1 条为本次更新前已收录的当日条目。",
    "lane": "system",
    "laneTitle": "刷新"
  },
  "todayWindow": {
    "date": "2026-06-01",
    "startAt": "2026-06-01T00:00:00.000Z",
    "endAt": "2026-06-01T12:00:00.000Z",
    "entryCount": 1,
    "status": {
      "kind": "ready",
      "message": "已生成当日科技雷达窗口",
      "sourceAttempted": true,
      "sourceArticleCount": 3,
      "ingestedEventCount": 1,
      "providerStatuses": []
    }
  },
  "nextRefreshAt": "2026-06-01T13:00:00.000Z",
  "recentWindowDays": 5,
  "recentCutoff": "2026-05-28",
  "recentEnd": "2026-06-01",
  "recentEmptyDays": ["2026-05-29", "2026-05-31"]
}
```

分区规则：`recent` = 近 5 日 `day`；`archives` = 当月已结束自然周 → `week`（`periodStart`—`periodEnd`）；未结束周 → 仍为 `day`；上月及更早 `month` 带 `periodStart`/`periodEnd` 为当月 01—末日。`recentEmptyDays` = 近窗口内无 `day` 条目的 UTC 日期（不含 `today`，today 空态由 `refreshCutoff` 展示）。条目与分区标题仅展示起止 `M.D — M.D`。

客户端按配置 `product.refreshIntervalHours`（默认 1）自动 `GET /feed` 静默刷新；该周期必须与首页日报一致。

时间显示约定：当日 `day` 条目在客户端展示到 `HH:mm`；非当日 `day` 条目展示到 `M.DD`；`week` / `month` 节点展示起止日，不展示小时分钟。

刷新锚点：`refreshCutoff` 与 UC-001 同构（`buildRefreshCutoffEntry`，`domain: tech-radar`），`at` = `lastRefreshedAt`；客户端在当月近窗口时间线**顶部**渲染该锚点。`todayWindow` 仍返回（`entryCount` 等）供测试/兼容。`lastRefreshedAt` 为本次 `/feed` 时间，`nextRefreshAt` = 其 + `refreshIntervalHours`。`recentEmptyDays` 列出近窗口内其余无条目日期，按倒序插入空日节点。

`todayWindow.status.kind` 与 UC-001 `report.status.kind` 对齐：

| kind | 含义 | UI 要求 |
|---|---|---|
| `not_fetched` | 当前日期尚未执行科技来源更新，仅按本地科技雷达库生成 | 引导用户刷新或检查配置 |
| `source_failed` | 已尝试拉源，但全部 provider 失败或超时 | 展示 provider 状态与配置/网络提示 |
| `filtered_empty` | provider 有返回，但未形成当日科技雷达条目 | 展示检索资料数量与筛选为空说明 |
| `ready` | 存在当日科技雷达条目或有效近窗口内容 | 展示时间线、相关资料与刷新锚点 |

## POST /backfill

Body: `{ "fromMonth": "2025-12", "toMonth": "2026-06" }` — 为缺失月份生成 `granularity=month` 归档条目（跳过当月）；创建后立即从日报科技栏 **充实**（非占位文案）。

## POST /repair-archives

Body: `{ "force": true }` — 将占位月报或 `example.com` 占位链替换为当月日报科技事件摘要与真实 `sources`；返回 `{ repaired, total, archives }`。

## POST /entries

请求体：完整或部分 `TechRadarEntry`（须含 `id` 或 `term`+`occurredAt` 生成 id）。

响应 `200`：`{ "ok": true, "entry": { ... } }`  
响应 `422`：`{ "error": "..." }`（文案质量或字段校验失败）

## TechRadarEntry 字段

| 字段 | 类型 | 必填 |
|------|------|------|
| `id` | string | 是 |
| `term` | string | 是 |
| `title` | string | 是 |
| `brief` | string | 是 |
| `status` | `open` \| `settled` \| `archived` | 是 |
| `granularity` | `day` \| `week` \| `month` | 是 |
| `occurredAt` | ISO8601 | 是 |
| `tags` | string[] | 否 |
| `briefingSessionId` | string \| null | 否 |
| `sources` | `{ title, url, provider? }[]` | 否 |
| `detailBlocks` | `{ label, body, sourceUrl?, sourceTitle? }[]` | 月归档推荐 |
| `relatedReportDates` | `string[]` | 可选；关联日报日期 |

## 与 UC-003

`briefingSessionId` 若存在，须能在 `reading-history.json` 中找到对应 session（写入时警告，不阻断 v1 种子）。
