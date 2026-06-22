---
name: std-development
description: >-
  Enforces STDD workflow for nexus-auto-info: update spec before coding in
  services/api or apps/web-react. Use for features, bugs, refactor, API/UI changes.
---

# STDD 开发流程

## 顺序

1. 读 `spec/use-cases/`、`spec/contracts/`、`spec/requirements/`
2. 改 `spec/`（UC / 契约 / constraints）
3. 编码：`services/api/`、`apps/web-react/`
4. 交付：`npm test` + `restart:clean`（见 `delivery-gates.mdc`、`RUN-VERIFICATION.md`）

## 映射

| 层 | 路径 |
|----|------|
| 规格 | `spec/` |
| API | `services/api/src/` |
| 前端 | `apps/web-react/` |

## 禁止

- 跳过 spec 直接改实现
- 根目录重复前端文件；与 constraints 冲突的 UI

## 检查清单

- [ ] spec 已更新
- [ ] `npm test` 通过
- [ ] 新 API 已更新 verify / test-features（如适用）

规则维护：`RULES-MAINTENANCE.md`
