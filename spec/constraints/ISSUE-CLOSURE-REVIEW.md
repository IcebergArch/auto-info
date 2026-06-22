# 问题关闭复盘（P0 · 最高优先级）

> 高于其它流程与门禁。用户提报问题在宣称「已完成」前须完成本页流程。

## 1. 适用范围

- 用户列出的 fix / style / uc / bug / 回归
- 自检缺陷、环境/路由失败
- **不适用**：纯咨询（汇报注明「未触发 P0」）

## 2. 每项问题

| 步骤 | 产出 |
|------|------|
| 根因 | 现象 → 直接原因 → 为何规则未拦住 |
| 审规则 | 查 `spec/constraints/*`、UC、相关 `.cursor/rules/*` |
| 补规则 | 增量修订 SSOT；UC 冲突以 constraints 为准 |
| 实现 | 代码 + `npm test` |
| 汇报 | P0 表 + Rule Delta（无增量须说明理由） |

### 2.1 模板

```markdown
### 问题：<标题>
- 现象 / 直接原因 / 为何未发现 / 规则修订 / 验证
```

### 2.2 按类型必查

| 类型 | 必查 |
|------|------|
| UI | `UI-DESIGN.md`、UC |
| 日报/首页 | UC-001、`FEATURE-TESTING.md` |
| 分析 | UC-002 |
| 阅读 | UC-003 |
| 快捷访问 | UC-005 |
| API | `spec/contracts/`、`verify.mjs` |
| 启动/环境 | `RUN-VERIFICATION.md` |
| 目录 | `DIRECTORY-STRUCTURE.md` |
| **修订规则本身** | `RULES-MAINTENANCE.md` |

## 3. 修订原则

1. 规格优先；增量完善，禁止删弱旧约束
2. 可测项 → `FEATURE-TESTING.md` 或 verify/test-features
3. 重复/冲突/冗余 → 合并（见 `RULES-MAINTENANCE.md`）
4. 历史批次 → `docs/iterations/RULE_INCIDENT_LOG.md`（不写在本页）

## 4. 汇报格式

```markdown
## 问题关闭复盘（P0）
| # | 问题 | 根因 | Rule Delta |
## Rule Delta
- …
```

## 5. 与其它门禁

P0 不替代 `npm test`、Design 审查、Product 验收；须并行满足。
