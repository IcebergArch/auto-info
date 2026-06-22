# 编码约束（一次性重构目标架构）

## 通用

- **规格优先**：先改 `spec/`，再写代码（STDD）。
- **最小 diff**：只改与当前目标相关文件，避免无关重排。
- **契约优先**：接口、字段、错误码改动先更新 `spec/contracts/`。
- **敏感信息安全**：密钥仅从环境变量读取，禁止写入仓库。

## 目录约定

```
services/api/src/     # Node 后端唯一实现
apps/web-react/       # React 前端唯一实现
spec/                 # 规格与约束 SSOT
data/                 # 本地持久化 JSON
```

## 后端（Node：`services/api/src`）

- 路由层只做参数校验与编排（`use-cases/*/routes.mjs`），核心逻辑下沉到 `service.mjs`。
- 共享能力（HTTP、存储、时间、校验）统一放 `shared/`，避免跨用例复制。
- IO 密集操作必须有超时与降级路径，禁止无保护阻塞主请求流程。
- 保持函数职责单一；复杂逻辑先拆分再组合，便于测试与回归。

## 前端（React：`apps/web-react`）

- 状态管理统一 Zustand，按业务切分 slice（日报/分析/回溯/快捷访问）。
- UI 组件统一 shadcn 设计体系。
- 图谱可视化统一 ReactFlow，边样式映射 `influence_score/polarity`。
- 页面结构保持用户心智：首页先日报后搜索，分析页先热点图再深度分析。

## 命名

- 用例目录：`uc-001-daily-events` 与 `UC-001-*.md` 对应。
- API：`/api/v1/{domain}/...`；动词用 POST/GET/DELETE 语义化路径。

## 测试与验证（每次更新完成后必做）

- **必须**先通过：`npm run audit`（见 `spec/constraints/DIRECTORY-STRUCTURE.md`）
- **必须**再执行：`npm run verify`（见 `spec/constraints/RUN-VERIFICATION.md`）
- **新功能/行为变更后必须**：按 `spec/constraints/FEATURE-TESTING.md` 做功能点测试
- **本地重构建议**：主流程以 `start:dev` / `start:web-react` 联调
- 通过标准：exit code `0`，核心 API 与首页返回 200，且改动用例验证通过
- 未通过则继续修复，不得结束任务
- 新增 API 须更新 `scripts/verify.mjs` 的 `SMOKE_ENDPOINTS`
- 可选：`npm start` 人工确认页面无控制台报错
