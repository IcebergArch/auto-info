# API-UC-001：今日重大事件

Base: `/api/v1/daily-events`

## POST /refresh

触发今日热点刷新（更新重大事件时间戳并写回存储）。

**Response 200:** `{ "ok": true, "refreshed": 3, "total": 4, "date": "2026-05-27" }`

## GET /today

当日重大事件（`special=true` 或 tags 含 `重大`，且 `occurredAt` 按产品时区 `Asia/Shanghai` 换算后为今日）。

**Query:** `category`（可选）

**Response 200:**

```json
{
  "date": "2026-05-26",
  "events": [{ "id", "title", "summary", "tags", "severity", "special", "category", "region", "time", "rank" }],
  "total": 3
}
```

## GET /report

生成指定日期的 auto-info 日报（**只读**，不写 `auto-info-reports.json`）。归档由 `POST /report/update`、`POST /report/store`、回溯补齐等写入接口完成。

**Query:** `date`（`yyyy-mm-dd`，默认产品今日，即 `Asia/Shanghai` 当日）, `reportMode`（可选：`v1|v2|v3`，默认 `v2`）

**Response 200:**

```json
{
  "date": "2026-05-27",
  "title": "2026-05-27 auto-info 日报",
  "reportMode": "v2",
  "overview": {
    "summary": "今日共纳入 4 条事件...",
    "bullets": ["科技与地缘事件居前"],
    "directions": {
      "international": "国际局势：...",
      "global": "全球：...",
      "domestic": "国内：...",
      "finance": "金融：...",
      "technology": "科技：...",
      "other": "其他：..." 
    },
    "interestSummaries": [
      { "topic": "AI", "summary": "AI训练与工程侧均出现新架构讨论。" }
    ]
  },
  "events": [
    {
      "id": "chip-export",
      "title": "...",
      "summary": "...",
      "category": "科技",
      "severity": 94,
      "impact": "..."
    }
  ],
  "focusSections": {
    "international": { "title": "国际局势", "summary": "国际局势：…", "events": [] },
    "technology": { "title": "科技", "summary": "科技：…", "events": [] },
    "finance": { "title": "金融", "summary": "金融：…", "events": [] },
    "domestic": {
      "title": "国内",
      "description": "医疗、旅行、民生、媒体热点与中国本土关注",
      "summary": "国内：…",
      "events": []
    }
  },
  "presentation": "timeline",
  "status": {
    "kind": "ready",
    "message": "已生成当日日报",
    "sourceAttempted": true,
    "sourceArticleCount": 8,
    "ingestedEventCount": 4,
    "providerStatuses": [
      { "provider": "googleNews", "status": "ok", "count": 5, "message": "Google News RSS 已返回结果" }
    ]
  },
  "refreshIntervalHours": 1,
  "nextRefreshAt": "2026-05-27T08:00:00.000Z",
  "lastRefreshedAt": "2026-05-27T07:00:00.000Z",
  "timeline": [
    {
      "id": "chip-export",
      "at": "2026-05-27T07:30:00.000Z",
      "time": "2026-05-27 07:30",
      "lane": "technology",
      "laneTitle": "科技",
      "title": "...",
      "displayTitle": "...",
      "desc": "...",
      "url": "https://..."
    }
  ],
  "relatedMaterials": [{ "id": "ref-chip-export", "title": "...", "url": "https://..." }],
  "reportLayouts": {
    "v1": { "title": "管理速读版", "highlights": ["..."], "riskNotes": ["..."] },
    "v2": { "title": "研究分析版", "threads": ["..."], "focus": ["..."] },
    "v3": { "title": "行动决策版", "priorities": ["..."], "nextActions": ["..."] }
  },
  "references": [
    {
      "id": "ref-chip-export",
      "eventId": "chip-export",
      "title": "...",
      "source": "本地事件库"
    }
  ],
  "review": {
    "status": "reviewed",
    "count": 1,
    "checks": ["日期范围", "事件完整度", "参考存在性", "结构完整性"]
  }
}
```

`review.count` 必须大于等于 `1`，否则前端不得展示为已生成日报。

日报展示主类目固定为：政治、金融、科技、其他。其他类目必须落入 `sections[key=other].subsections`，并按原始 `category` 再分组。
当 `date` 为产品今日时，响应须含 `presentation: "timeline"`、`timeline[]`（按 `occurredAt` 降序，含 `lane`/`laneTitle`/`time`/`desc`/`url`）、`relatedMaterials[]` 与 `refreshIntervalHours`（来自配置 `product.refreshIntervalHours`，默认 1；客户端按该周期自动 `GET /report`）。日报同日判断使用产品时区 `Asia/Shanghai`，例如 `2026-06-04T20:12:00.000Z` 属于 `2026-06-05` 日报。

`status.kind` 是前端空态与刷新状态的稳定来源：

| kind | 含义 | UI 要求 |
|---|---|---|
| `not_fetched` | 当前日期尚未执行拉源更新，仅按本地事件库生成 | 引导点击「刷新当日」 |
| `source_failed` | 已尝试拉源，但全部 provider 失败或超时 | 展示 provider 状态与配置/网络提示 |
| `filtered_empty` | provider 有返回，但转换/筛选后没有当日有效事件 | 展示检索资料数量与筛选为空说明 |
| `ready` | 存在当日事件，报告与来源证据可展示 | 展示事件时间线与相关资料 |

`GET /report` 只读，不主动拉源、不写归档。若当天没有刷新记录或归档来源状态，服务端不得暗示「已检索但无事件」，应返回 `not_fetched` 或兼容旧数据推导出的最保守状态。

`POST /report/backfill` 支持 `from`+`to` 长区间：超过 31 天时服务端**按月分批**执行（如 `2025-12-01` 至今日）。非今日或已归档快照为 `presentation: "archived"`，正文使用 `focusSections` 四块：`international` | `technology` | `finance` | `domestic`（互斥归并；历史数据可含 `other`，读取时迁移为 `domestic`）。

前端展示格式（auto-info 内容区）：

1. `概要`：`overview.summary` + `overview.panels`（`international` / `technology` / `finance`，各含 `points[]` 垂直要点；三栏 1:1:1 等高）；兼容 `overview.bullets`  
2. `国际局势`（`focusSections.international.events`）  
3. `科技`（`focusSections.technology.events`）  
4. `金融`（`focusSections.finance.events`）  
5. `其他`（`focusSections.other.events`，展示 `description` 说明域范围）  
6. `参考`（`references`）  
7. `reportMode` 决定优先展示哪一版布局（`reportLayouts[reportMode]`）

同一日期只展示一篇日报（`date` 为主键）。

## POST /report/update

更新某一日的日报。默认拉取当日外部信源后重新生成并自动归档。

**Body:**

```json
{
  "date": "2026-05-27",
  "pullSources": true
}
```

`pullSources=false` 可用于只按本地事件库重建并归档日报。

**Response 200:**

```json
{
  "ok": true,
  "date": "2026-05-27",
  "updated": 6,
  "sourceSearches": [{ "topic": "科技", "providerStatuses": [] }],
  "status": {
    "kind": "ready",
    "message": "已拉取来源并生成 6 条事件",
    "sourceAttempted": true,
    "sourceArticleCount": 10,
    "ingestedEventCount": 6,
    "providerStatuses": []
  },
  "report": { "date": "2026-05-27", "status": { "kind": "ready" }, "review": { "count": 1 } },
  "archive": { "ok": true, "reason": "daily_update" }
}
```

首页手动「刷新当日」默认必须调用本接口且保持 `pullSources=true`（可省略，因为默认值为 `true`）。`pullSources=false` 仅用于本地调试、测试或显式维护场景，前端普通用户刷新不得使用。

## POST /report/backfill

回溯补齐指定月份或 `[from, to]` 闭区间内每日消息，并为每一天生成/归档日报。单次最多 31 天（自然月不超过 31 天）。

**Body（推荐按最近天数）：**

```json
{
  "days": 7,
  "to": "2026-05-29",
  "pullSources": true
}
```

- `days`：闭区间天数，含 `to` 当日；`to` 省略时默认为 UTC 今日。
- `days` 与 `month` / `from`+`to` 互斥，优先 `month`，其次 `days`。

**Body（按月）：**

```json
{
  "month": "2026-05",
  "pullSources": true
}
```

**Body（兼容按日区间）：**

```json
{
  "from": "2026-05-20",
  "to": "2026-05-27",
  "pullSources": true
}
```

**Response 200:**

```json
{
  "ok": true,
  "from": "2026-05-20",
  "to": "2026-05-27",
  "totalDays": 8,
  "totalUpdated": 18,
  "reports": [{ "date": "2026-05-20", "updated": 2, "eventCount": 4, "reviewStatus": "reviewed" }],
  "report": { "date": "2026-05-27", "review": { "count": 1 } }
}
```

前端进度展示约定：
- 推荐按天调用 `POST /report/update` 实现实时进度条（`x / totalDays`）；
- 也可调用本接口后展示最终结果，但不得省略“处理中”反馈。
- 回溯执行期间，前端可消费 `sourceSearches[]` 作为“当前检索到的资料”日志源，并在侧边栏折叠/展开展示。

## POST /report/store

兼容旧前端的显式存储接口。新交互中，生成、更新、搜索等操作会自动归档日报快照。存储前必须重新生成日报并完成至少一次 review。

**Body:** `{ "date": "2026-05-27" }`

**Response 200:**

```json
{
  "ok": true,
  "date": "2026-05-27",
  "storedAt": "2026-05-27T00:00:00.000Z",
  "totalReports": 3,
  "report": { "title": "2026-05-27 auto-info 日报", "review": { "count": 1 } }
}
```

同一日期重复存储时保留最新快照。

## GET /reports

返回已归档日报快照列表。

**Query:** `limit`（默认 30）

**Response 200:** `{ "items": [{ "date", "storedAt", "title", "eventCount", "reviewStatus" }], "total": 1 }`

## DELETE /reports/:date

删除指定日期日报快照。

**Response 200:** `{ "ok": true, "date": "2026-05-27", "deleted": true, "totalReports": 0 }`

## GET /

事件列表（同原 auto-info，支持筛选）。

**Query:** `category`, `from`, `to`, `majorOnly`（`1` 仅重大）

## GET /history

**Query:** `from`, `to` — 按 `occurredAt` 回溯

## GET /search-history

返回首页咨询历史及结果摘要。

**Query:** `limit`（默认 20）

**Response 200:** `{ "items": [{ "id", "query", "resultTitle", "resultSummary", "createdAt" }], "total": 1 }`

## POST /intake

根据用户输入检索同类事件；若输入带“最新/今日/进展/新闻/动态”等新鲜度意图，必须先检索外部信源（Google Search / Brave Search / 免费通道）并把来源写入事件参考；若无足够匹配则按推断类目写入新事件。

**Body:**

```json
{
  "query": "AI 芯片 出口限制",
  "category": "科技",
  "searchLatest": true
}
```

`category` 可选；缺省时服务端按关键词推断（科技/宏观/金融/地缘/气候/产业/政策/能源）。
`searchLatest` 可选；缺省时服务端会按关键词自动识别新鲜度意图。

**Response 200:**

```json
{
  "query": "AI 芯片 出口限制",
  "inferredCategory": "科技",
  "matches": [],
  "categoryEvents": [],
  "created": true,
  "sourceSearch": {
    "attempted": true,
    "providerStatuses": [{ "provider": "brave", "status": "configured", "count": 3 }],
    "articles": [{ "title", "url", "source", "publishedAt", "provider" }]
  },
  "historyItem": { "id", "query", "resultTitle", "createdAt" },
  "event": { "id", "title", "category", "summary", "tags", "severity" }
}
```

## POST /events

写入或更新事件（body 单条或 `{ "events": [] }`）。

## GET /focus

返回用户关注类别。

**Response 200:** `{ "items": ["国际局势", "中国政策", "AI"], "total": 3 }`

## POST /focus

新增一个关注类别。

**Body:** `{ "name": "音视频" }`

**Response 200:** `{ "ok": true, "items": ["国际局势", "中国政策", "AI", "音视频"], "total": 4 }`

## DELETE /focus/:name

删除一个关注类别。

**Response 200:** `{ "ok": true, "deleted": true, "items": ["国际局势", "中国政策", "AI"], "total": 3 }`

## GET /events/:id/timeline

**Query:** `from`, `to`, `fill=1`

## POST /events/:id/timeline/fill

Body: `{ "from", "to" }`

## 兼容

| 旧路径 | 代理至 |
|--------|--------|
| `/api/auto-info` | `GET /` |
| `/api/auto-info/history` | `GET /history` |
| `/api/auto-info/events` | `POST /events` |
| `/api/auto-info/events/:id/timeline` | `GET /events/:id/timeline` |
| `/api/auto-info/events/:id/timeline/fill` | `POST .../fill` |
