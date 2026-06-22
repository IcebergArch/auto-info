# 规则维护（元约束）

> 规则本身也需遵守 P0：修订规则时先查重、消冲突，再增量写入 SSOT。

## 原则

1. **简洁**：一条规则只表达一个可执行要求；细则放 SSOT，Cursor 规则只做指针。
2. **单一事实源**：同一主题只在一处写全；其它文件用链接引用，不复制段落。
3. **分层**：`LAW.md`（不可违背）→ `NORMS.md`（默认实践）→ 专题约束（UI、运行、测试等）→ `REFERENCES.md`（可选参考）。
4. **冲突处理**：以 `spec/constraints/` 为准，回写 UC；**禁止**删弱旧约束来「过关」。
5. **冗余合并**：发现重复门禁（如 verify / restart / test 多处重复）合并到 `RUN-VERIFICATION.md` + `FEATURE-TESTING.md`，Cursor 侧合并为 `delivery-gates.mdc`。
6. **过时清理**：路径/栈变更（如 `apps/web` → `apps/web-react`）须同步删除或改写冲突条文。

## 文件职责（速查）

| 文件 | 职责 |
|------|------|
| `LAW.md` | 6 条法则，不含实现细节 |
| `NORMS.md` | 产品形态、风格概要、流程概要、P0 指针 |
| `ISSUE-CLOSURE-REVIEW.md` | P0 复盘流程与模板 |
| `UI-DESIGN.md` | UI/交互 SSOT |
| `RUN-VERIFICATION.md` | verify / restart / 双端在线 |
| `FEATURE-TESTING.md` | npm test / 功能点 / 脚本更新 |
| `DIRECTORY-STRUCTURE.md` | 目录与 audit |
| `PROJECT-CLEANUP.md` | 清理与文档归档 |
| `docs/rules/TEAM_WORKFLOW.md` | Agent 分工与验收记录 |
| `docs/iterations/RULE_INCIDENT_LOG.md` | 历史问题复盘（非门禁） |

## 修订检查清单

- [ ] 是否与现有条文重复？→ 合并，不另起炉灶
- [ ] 是否与 UC / UI / 实现冲突？→ 以 constraints 为准并回写
- [ ] 是否可测？→ 落到 verify / test-features / FEATURE-TESTING
- [ ] Cursor `.mdc` 是否可缩为指针？→ 是则缩短
