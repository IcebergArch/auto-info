# API-UC-004：系统配置

Base: `/api/v1/config`

## GET /

返回当前系统配置。敏感 key 仅返回掩码。

**Response 200:**

```json
{
  "storage": {
    "primary": "mysql",
    "fallback": "json",
    "mysql": { "host": "127.0.0.1", "port": 3306, "database": "auto-info", "user": "root" }
  },
  "graph": {
    "provider": "neo4j",
    "neo4j": { "host": "127.0.0.1", "boltPort": 7687, "httpPort": 7474, "database": "auto-info" }
  },
  "sources": {
    "googleSearch": { "enabled": true, "apiKeyMasked": "sk...abcd" },
    "braveSearch": { "enabled": false, "apiKeyMasked": "" },
    "jinaReader": { "enabled": false, "apiKeyMasked": "" }
  },
  "llm": {
    "provider": "openrouter",
    "model": "openai/gpt-4.1-mini",
    "apiKeyMasked": "sk...abcd"
  },
  "product": {
    "refreshIntervalHours": 3
  }
}
```

`product.refreshIntervalHours`：今日日报时间线与科技雷达页的自动刷新周期（小时，1～168，默认 1）。

## PUT /

保存配置。请求体可包含敏感 key；响应仍只返回掩码。

## GET /status

探测链路状态。

**Response 200:**

```json
{
  "storage": { "primary": "mysql", "status": "connected|degraded|missing", "message": "..." },
  "graph": { "provider": "neo4j", "status": "connected|degraded|missing", "message": "..." },
  "sources": [
    { "name": "googleSearch", "status": "configured|free|missing" },
    { "name": "braveSearch", "status": "configured|missing" },
    { "name": "jinaReader", "status": "configured|free|missing" }
  ],
  "llm": { "provider": "openrouter", "status": "configured|missing" }
}
```

`sources.status` 说明：
- `configured`：已配置付费/官方 API 凭据
- `free`：未配置凭据但已启用免费通道（Google News RSS / GDELT / Nitter）
- `missing`：未启用

## POST /sync

同步本地事件数据到 MySQL，并尝试同步事件分析图谱到 Neo4j。

**Response 200:** `{ "ok": true, "mysql": { "status", "message" }, "neo4j": { "status", "message" } }`
