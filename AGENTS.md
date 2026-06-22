# Agent 指南

## 栈与目录

- 前端：`apps/web-react`（React + Zustand + shadcn）
- 后端：`services/api`（Node）
- 规格 SSOT：`spec/`；流程：`docs/rules/TEAM_WORKFLOW.md`

## 角色（摘要）

| Agent | 交付 |
|-------|------|
| Product | 需求/UC、验收关闭 |
| Architecture | 边界、契约 |
| Implementation | services、apps |
| Quality | 测试、风险 |
| Design | UI 审查（通过/驳回） |

## 铁律

0. **P0** — 提报问题先复盘+补规则（`ISSUE-CLOSURE-REVIEW.md`）
1. 先 `spec` 后代码
2. 密钥不入库
3. 交付 `npm test` + 双端在线（`delivery-gates.mdc`）
4. 目录 `npm run audit`；唯一实现，禁止双份
5. UI 须 Design 审查；任务须 Product 验收
6. 修订规则须简洁去重（`RULES-MAINTENANCE.md`）

## Cursor 规则索引

| 规则 | 用途 |
|------|------|
| `issue-closure-rule-review.mdc` | P0 |
| `rules-maintenance.mdc` | 规则去重/消冲突 |
| `std-workflow.mdc` | STDD |
| `delivery-gates.mdc` | verify/test/启动 |
| `product-agent-lifecycle.mdc` | 流程与验收 |
| `design-agent-review.mdc` | UI 审查 |
| `ui-apple-and-user-centered.mdc` | UI 原则摘要 |
| `project-cleanup.mdc` | 清理 |
| `coding-standards.mdc` | 编码 SSOT 指针 |
