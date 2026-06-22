# Coding Rules（重构版）

## General

- 规格优先：先更新 `spec/`，再实现代码
- 所有行为变更必须可测试（单元/集成/功能回归）
- 禁止重复实现，优先复用共享模块
- 单模块单职责，避免超长函数与隐式副作用
- 秘钥/口令仅允许从环境变量读取

## Frontend

- 目标层统一 `React + Zustand + shadcn + ReactFlow`
- 页面按业务拆分到 `pages/`，通用组件放 `components/`
- 状态按业务 slice 管理（日报、分析、回溯、快捷访问）
- 图谱边宽映射 `influence_score`，边色映射 `polarity`

## Backend

- 目标层统一 `Node.js services/api`
- 路由层只做入参校验与编排，核心逻辑放 `service.mjs`
- 用例能力按 `uc-xxx` 拆分，禁止跨用例耦合
- 外部抓取/补齐等重操作必须有超时、降级与错误回传

## Refactor Rules

- 本地一次性重构，统一到 `api` 与 `web-react`
- 删除重复实现与过时路径，避免双份维护
- 通过 `audit + verify + test` 作为重构稳定性保障
