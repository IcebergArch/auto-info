# UC-006：AI 科技雷达（概念 / 热词 / 论文）

**Implements:** REQ-F-006  
**Actors:** 用户（主）、科技雷达存储（次）、阅读助手（UC-003，可选关联）  
**Preconditions:** API 与 `data/auto-info-tech-radar.json` 已初始化（含种子）  
**Postconditions:** 用户可浏览近期热词与往期月报，并可跳转关联阅读简报

## 触发

用户点击顶栏 **「科技雷达」**。

## 主流程

1. 客户端 `GET /api/v1/tech-radar/feed`。
2. 服务端 `buildTechRadarTimeline` 输出 `timeline` 树（保留 `recent`/`archives` 兼容）：
   - **当年**：按 **月** 折叠节点（左轴显示月份 + 起止）；**当月**内：近 5 日 + 未满周 → **日卡**；已满自然周 → **周报卡**；**当年已结束月** → **月报卡**（整月 `5.01 — 5.31`）。
   - **历史年**：每年一个 **年** 折叠节点（默认收起），展开为各 **月月报**。
3. 左主区 **单一时间线**（`TechRadarNestedTimeline`）：左侧时间轴 + 连接线 + 柔和折叠 Card；与 UC-001 今日日报共用 **`refreshCutoff`「上次更新」锚点**（`shared/timeline-refresh.mjs` + `TimelineRefreshCutoff` 组件）：`00:00 — lastRefreshedAt`，无当日条目时在锚点标注空态，有条目时锚点之下为更早的当日/近窗口节点（倒序）。全局范围只在区块标题展示；当月日级内容按日期组成卡片组，**近 5 日窗口内倒序**（最新在上）。近窗口内其他无条目日期（如 `6.02`）须展示 **空日节点**（`0 条 · 暂无科技雷达条目`）。`todayWindow` 仅作兼容计数，展示以 `refreshCutoff` 为准。
4. 月报 `detailBlocks` 从当月日报 **科技** 分栏充实；`POST /repair-archives` 可强制重刷；选中高亮，右栏 `sources`。
5. 右栏（2 列宽）仅展示 **相关资料** 列表，禁止重复主区正文。
6. 客户端每 **1 小时**自动 `GET /feed` 静默刷新；响应含 `refreshIntervalHours: 1` 与 `nextRefreshAt`，刷新节奏与首页报告一致。
7. 时间呈现规则：**当日**科技雷达条目与今日窗口展示到 **小时:分钟**；非当日条目与归档节点只展示到 **天**（如 `6.01`），避免同一时间线内出现冗余时间精度。
8. 科技雷达与 UC-001 今日日报共享刷新/空态语义：当日窗口为空时，必须区分 `not_fetched`、`source_failed`、`filtered_empty` 与 `ready`，并在 `refreshCutoff` 或状态提示中说明来源健康、检索资料数量和筛选结果；禁止只展示「暂无科技雷达条目」而不说明是否已拉源。

## 简报跳转

1. 条目含 `briefingSessionId` 时显示「查看简报」。
2. 用户点击后切换至 **阅读助手** Tab，并恢复该 `sessionId` 的简报（与 UC-003 历史回填一致）。

## 扩展：录入条目（v1 管理）

1. `POST /api/v1/tech-radar/entries` 写入或更新条目（种子脚本 / 后续半自动入库）。
2. `title` / `brief` 不得为 UC-001 类模板空话（`;对象：`、`值得跟踪` 等）。

## 验收

- 种子含 **cursor: loop**、**harness**、至少 **2 条大厂平台**（Google / Anthropic / OpenAI / X 等）近期条目与 **2026-05** 月归档。
- 布局为 **8:2**（`tech-radar-grid`）。
- `npm test` 与 `GET /api/v1/tech-radar/feed` 通过，且 `refreshIntervalHours === 1`。
- 当日空窗口可解释：未拉源、来源失败、筛选为空和有条目四类状态均有稳定字段与可读文案。
