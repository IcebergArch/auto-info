# 项目规范

规范是默认实践，不得违背 `LAW.md`。细则 SSOT 见各专题文件；维护原则见 `RULES-MAINTENANCE.md`。

## 产品形态（摘要）

- 首页：搜索 + 主区日报；侧栏仅筛选日期（UC-001）
- 日报：`yyyy-mm-dd`，概述/事件/参考/review；政治·金融·科技·其他
- 分析：主题/标签 + 脉络图 + 文字关联列表（UC-002）
- 阅读助手：中文简报 + 原文链接（UC-003）
- 快捷访问：URL 目录 + 新窗口打开（UC-005）
- 配置：MySQL / Neo4j / 检索 / LLM（UC-004）

## 设计风格（摘要）

- Apple 克制风；响应式；详见 `UI-DESIGN.md`
- 分析关联用**文字列表**，不用 ReactFlow 缩放主视图

## 实现偏好（摘要）

- 栈：`apps/web-react` + `services/api`
- MySQL 主存储；Neo4j 图谱；本地 JSON 为降级
- 新 API → 更新 `verify.mjs`、`test-features.mjs`
- 密钥仅环境变量或本地 `data/system-config.json`（掩码）

## 流程（摘要）

`Product 发起 → 实现 → Design 审查 → Quality 验证 → Product 验收` — 详见 `docs/rules/TEAM_WORKFLOW.md`

## P0 问题关闭

用户提报问题须先复盘并修订规则。流程：`ISSUE-CLOSURE-REVIEW.md`（历史见 `docs/iterations/RULE_INCIDENT_LOG.md`）。

## 交付门禁（摘要）

`npm test` + `restart:clean` + 双端在线 — 详见 `RUN-VERIFICATION.md`、`FEATURE-TESTING.md`。
