# Team Workflow（Product 驱动）

## 流程

`Product 发起 → 分配 → 实现 → Design 审查 → Quality 验证 → Product 验收`

未 Product 验收通过，不得结束任务。STDD：先 `spec` 后代码。

连续重构 10 轮：见 `docs/iterations/REFACTOR_10X_PROGRAM.md`。

## 阶段要点

| 阶段 | 要点 |
|------|------|
| 发起 | 目标、范围、验收标准；更新 requirements / UC / contracts |
| 实现 | P0 复盘（提报问题时）；环境检查见 `RUN-VERIFICATION.md` |
| Design | UI 审查，结论仅通过/驳回 |
| Quality | `npm test`（含 audit、verify、test:features） |
| 验收 | 四维：功能 · 流程 · 美观 · Apple/用户任务优先 |

## 交付记录（摘要）

- P0 复盘 + Rule Delta（`ISSUE-CLOSURE-REVIEW.md`）
- Product / Design / Quality 结论
- 变更清单（如有）

Rule Review、Environment Preflight 已并入 P0 与 `RUN-VERIFICATION.md`，勿重复填写。

## 连续执行模式

Product 指令「按轮次连续完成」时，可同批推进多轮，但仍须每轮完整审查与验收；完成后更新 `REFACTOR_10X_PROGRAM.md`、`REFACTOR_10X_EXECUTION_LOG.md`。
