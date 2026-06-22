# API-UC-005：快捷访问

Base: `/api/v1/quick-access`

> 设计定位：UC-005 是**前端为主**的 URL 启动器。URL 目录与历史持久化在浏览器 `localStorage`（key: `quick-access-history`），**不经后端存储**。后端仅保留一个受限的本地调试反代端点，快捷访问页**不依赖**它（见 UC-005 spec「为何不用 iframe」）。

## 前端契约（无后端）

- URL 目录：`localStorage["quick-access-history"]`，字符串数组，最近访问优先、去重，最多 40 条。
- 打开方式：`window.open(url)` 在新标签打开完整站点；弹窗被拦截时降级为「在新窗口打开」按钮 + 复制链接。
- URL 规范化：`localhost` / `host:port` / 纯 IP 默认补 `http://`，其它默认 `https://`；仅接受 `http`/`https`。

## GET /api/v1/quick-access/embed/{host:port}/{path}

仅供**本地调试 / 兼容**的反向代理；剥离 `X-Frame-Options`、`Content-Security-Policy` 等禁嵌入响应头，并改写 HTML 中的根路径资源引用。**不得作为快捷访问页主路径**（iframe 预览已被 UI-DESIGN 与 UC-005 禁止）。

约束：

- 目标 `host` **仅允许** `localhost` / `127.0.0.1` / `::1`；端口 1–65535。非本地目标返回 `400 Invalid embed target`。
- 仅支持 `GET` / `HEAD`；其它方法返回 `405 Method Not Allowed`。
- 典型用途：本地 Neo4j Browser（`http://localhost:7474`）等开发期自检，不面向终端用户。

**Response：** 透传上游响应（已剥离禁嵌入头、改写资源路径）。

**异常：**

- 非法/非本地目标：`400 Invalid embed target`
- 不支持的方法：`405 Method Not Allowed`
