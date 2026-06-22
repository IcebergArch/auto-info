# STDD 规格目录（Specification-Driven）

本目录是**唯一事实来源（SSOT）**。任何功能变更必须先更新此处，再修改 `services/` 与 `apps/` 实现。

## 结构

```
spec/
├── requirements/          # 产品需求
├── use-cases/             # UC-001 ~ UC-005 用例
├── contracts/             # HTTP API 契约
└── constraints/           # 设计与编码约束
    ├── LAW.md             # 法则：不可违背
    ├── NORMS.md           # 规范：默认遵循
    ├── REFERENCES.md      # 参考：选择性使用
    ├── UI-DESIGN.md
    ├── CODING-STANDARDS.md
    ├── DIRECTORY-STRUCTURE.md
    ├── RUN-VERIFICATION.md
    ├── FEATURE-TESTING.md
    └── DATA-STORAGE.md
```

## 实现映射

| 用例 | 服务模块 | 前端 |
|------|----------|------|
| UC-001 今日重大事件 | `services/api`（唯一后端） | `apps/web-react`（唯一） |
| UC-002 事件标签分析 | `services/api`（唯一后端） | `apps/web-react`（唯一） |
| UC-003 阅读助手 | `services/api`（唯一后端） | `apps/web-react`（唯一） |
| UC-004 系统配置 | `services/api`（唯一后端） | `apps/web-react`（唯一） |
| UC-005 快捷访问 | `services/api`（唯一后端） | `apps/web-react`（唯一） |

## 变更流程（强制）

1. 更新 `requirements/` 或 `use-cases/` 或 `contracts/`
2. 若涉及高维系统约束、视觉或代码风格，同步 `constraints/` 三层文件及对应约束
3. 再修改 `services/api` / `apps/web-react`
4. 执行 `npm run audit`（目录审查，必须通过）
5. 执行 `npm run verify`（含 audit + 运行冒烟，必须通过）
6. 新功能/行为变更执行 `npm test`（`verify + test:features`）
7. 默认联调链路为 `start:dev`（React + Node）

详见项目 Skill：`.cursor/skills/std-development/SKILL.md`
