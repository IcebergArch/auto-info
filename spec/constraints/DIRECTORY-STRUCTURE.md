# 目录结构规范（STDD + 双层运行）

本文件是仓库**目录布局的唯一规范（SSOT）**。每次变更结束须执行 `npm run audit` 对照审查。

## 标准树

```
auto-info/
├── spec/                               # 规格（先改这里）
│   ├── README.md
│   ├── requirements/
│   ├── use-cases/                      # UC-001 ~ UC-005
│   ├── contracts/
│   └── constraints/
│       ├── LAW.md
│       ├── NORMS.md
│       ├── REFERENCES.md
│       ├── DIRECTORY-STRUCTURE.md
│       ├── CODING-STANDARDS.md
│       ├── RUN-VERIFICATION.md
│       ├── FEATURE-TESTING.md
│       ├── DATA-STORAGE.md
│       └── PROJECT-CLEANUP.md
├── services/
│   └── api/                            # Node 后端（唯一）
│       └── src/
│           ├── shared/
│           └── use-cases/
├── apps/
│   └── web-react/                      # React 前端（唯一）
│       └── src/
│           ├── pages/
│           ├── components/
│           ├── stores/
│           ├── services/
│           └── styles/
├── docs/
│   ├── architecture/                   # 架构设计文档
│   ├── rules/                          # 规则、流程、模板
│   └── iterations/                     # 迭代计划与执行记录
├── scripts/                            # verify、audit、test-features
├── data/                               # 本地 JSON 持久化
├── .cursor/
│   ├── skills/
│   └── rules/
├── AGENTS.md
├── README.md
├── package.json
└── server.mjs                          # 根启动入口
```

## 用例与目录映射

| 用例 | spec | 实现 |
|------|------|---|
| UC-001 | `spec/use-cases/UC-001-*.md` | `services/api/src/use-cases/uc-001-*` + `apps/web-react/src/pages/` |
| UC-002 | `spec/use-cases/UC-002-*.md` | `services/api/src/use-cases/uc-002-*` + `apps/web-react/src/pages/` |
| UC-003 | `spec/use-cases/UC-003-*.md` | `services/api/src/use-cases/uc-003-*` + `apps/web-react/src/pages/` |
| UC-004 | `spec/use-cases/UC-004-*.md` | `services/api/src/use-cases/uc-004-*` + `apps/web-react/src/pages/` |
| UC-005 | `spec/use-cases/UC-005-*.md` | `services/api/src/use-cases/uc-005-*` + `apps/web-react/src/pages/` |
| UC-006 | `spec/use-cases/UC-006-*.md` | `services/api/src/use-cases/uc-006-tech-radar/` + `apps/web-react/src/pages/TechRadarPage.tsx` |

## 禁止（须清理）

| 路径 | 原因 |
|------|------|
| `backend/` | 已迁移至 `services/` |
| `public/` | 已迁移至 `apps/` |
| `std/` | 已合并至 `spec/` |
| 根目录 `index.html` / `app.js` / `styles.css` | 与 `apps/` 重复，禁止双份前端 |

## 原则（业界实践）

1. **规格与实现分离**：`spec/` 不含可执行代码。  
2. **唯一实现**：前后端统一使用 `api + web-react`。  
3. **一次性替换**：本地重构无需切流开关。  
4. **禁止双后端**：不得并行维护 `api` 与 `api-py` 两套可运行后端。  
5. **工具脚本集中**：`scripts/`，不散落根目录。  
6. **不提交空壳目录**：空目录应删除或补全最小可运行文件。

## 审查命令

```bash
npm run audit
```

与 `npm run verify` 一并作为交付门禁（`verify` 会先执行 `audit`）。
