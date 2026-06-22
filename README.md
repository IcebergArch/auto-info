# Nexus Auto-Info

信息情报平台，采用 **STDD（规格驱动）+ 两层默认运行链路（React + Node）**：

- 默认后端：`services/api`（唯一交付链路）
- 前端：`apps/web-react`

## 项目结构

```
auto-info/
├── spec/                      # 规格 SSOT（需求/用例/契约/约束）
├── services/
│   └── api/                   # Node 后端
├── apps/
│   └── web-react/             # React 前端
├── docs/
│   ├── architecture/          # 架构设计文档
│   ├── rules/                 # 规则、流程、模板
│   └── iterations/            # 迭代计划与执行记录
├── scripts/                   # audit / verify / test-features
├── data/                      # 本地存储（JSON）
└── server.mjs                 # 根启动入口
```

## 常用命令

> 在 Markdown Preview 中可一键点击执行（首次可能提示信任命令链接）。
> 运行目录固定为项目根：`/Users/shatang/Project/nexus-os/auto-info`


兜底命令（可复制）：

```bash
npm run start:web-react
```
```bash
npm run start:dev
```
```bash
npm run restart:clean
npm run audit
npm run verify
npm run test:features
npm test
```

## 架构原则

1. 先改 `spec/`，再改代码
2. 一次性重构，统一目标栈
3. 以测试门禁保障稳定
4. 密钥仅环境变量，不入仓

## 用例域

| 用例 | 域路径 | 说明 |
|------|--------|------|
| UC-001 | `/api/v1/daily-events` | 日报与事件流 |
| UC-002 | `/api/v1/analysis` | 事件关联分析图 |
| UC-003 | `/api/v1/reading-assistant` | 阅读助手与摘要 |
| UC-004 | `/api/v1/config` | 系统配置与链路状态 |
| UC-005 | `/quick-access` | 快捷访问与历史 |

详细规范见：
- `AGENTS.md`
- `docs/architecture/SYSTEM_DESIGN.md`
- `docs/rules/CODING_RULES.md`
- `docs/rules/TASK_TEMPLATE.md`
- `docs/rules/TEAM_WORKFLOW.md`
- `docs/rules/AGENT_COLLAB_PROTOCOL.md`
- `docs/iterations/REFACTOR_10X_PROGRAM.md`
- `docs/iterations/REFACTOR_10X_EXECUTION_LOG.md`
- `spec/constraints/*`
