# Information Intelligence Platform（System Design 2026）

## 1. Architecture

- Frontend: `apps/web-react` (`React + Zustand + ReactFlow`)
- Backend: `services/api` (`Node.js`)
- Data: MySQL（结构化数据）+ Neo4j（关系图谱）+ JSON（本地回退）
- Runtime: 本地两层默认运行（React + Node）

## 2. Core Modules

### A) Daily Intelligence Report

- 输入：全球事件流、历史库、用户关注主题
- 处理：聚类、去重、摘要、时间线组织、日报编排
- 输出：当日日报、历史日报、专题摘要

### B) Event Graph Engine

- 节点：`event_node`
- 边：`influence_score / polarity / confidence`
- 能力：时间线主链、分叉影响、跨主题关联
- 展示：ReactFlow（主链左到右，分叉箭头体现影响）

### C) Reading Assistant

- 输入：URL/文本/文档混合输入
- 处理：抽取、结构化总结、关键观点与风险提示
- 输出：中文摘要、历史记录、可追溯上下文

### D) Async Task Center

- 任务类型：历史补齐、外部检索、批量同步、摘要生成
- 执行：Celery Worker + Redis Broker
- 接口：任务创建、进度查询、结果查询、失败重试

## 3. API Design Principles

- 统一前缀：`/api/v1/*`
- 统一响应：成功数据 + 可读错误信息
- 统一契约：变更必须先更新 `spec/contracts/`
- 统一实现：由 Node API 提供服务

## 4. Refactor Strategy

1. 本地一次性重构，不做路由切流
2. 删除重复实现，保留唯一服务路径
3. 通过自动化测试保障重构稳定性

## 5. Quality Gates

- `npm run audit`
- `npm run verify`
- 新功能/行为变更：`npm test`
