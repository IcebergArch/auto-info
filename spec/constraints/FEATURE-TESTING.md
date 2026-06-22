# 新功能测试验证约束

每次**新增或修改功能**后，必须在交付前完成测试验证，不得仅凭代码审阅宣称完成。

## 两层验证

### 1. 自动化（必须）

```bash
npm test
```

等价于依次执行 `npm run verify` + `npm run test:features`。

也可单独执行：

```bash
npm run verify        # 目录审查 + 语法 + 基础冒烟
npm run test:features # UC-001/002/003 功能回归（见 scripts/test-features.mjs）
```

- 全部命令 exit code 必须为 `0`
- **若新增/变更 API**，须同步更新：
  - `scripts/verify.mjs` → `SMOKE_ENDPOINTS`
  - `scripts/test-features.mjs` → `FEATURE_TESTS`（含响应断言）
- **若变更目录**，`audit` 须通过

### 2. 功能点验证（必须，按改动范围）

对照本次修改涉及的用例，至少完成下表中对应项：

| 用例 | 验证方式 |
|------|----------|
| UC-001 今日事件 / 检索入库 | `curl -X POST .../intake` 或首页输入新主题 → 分析 → 查看类目信息流 |
| UC-001 日报日期边界 | `scripts/test-report-event-window.mjs` 须覆盖产品时区日界，确保晚间 UTC 事件归入正确本地日，且禁止近 N 天混入 |
| UC-001 热点刷新 | 首页「更新今日热点」→ 榜单刷新 |
| UC-002 标签分析 | 分析 Tab 选标签 → 生成关联图 |
| UC-003 阅读助手 | 提交链接/正文 → 生成摘要 → 历史列表出现记录 |

仅改 UI 样式：启动 `npm start`，目视检查首页 / 分析 / 阅读助手，浏览器控制台无报错。

### UC-003 自动验收维度（新增）

阅读助手摘要需满足以下自动验收维度（至少在 `scripts/test-features.mjs` 断言其中关键项）：

1. 要点数量：`keyPoints.length >= 3`
2. 中文输出：`summary` 与 `keyPoints` 必须包含中文文本
3. 去重度：要点不能大量重复同一句模板
4. 可执行性：要点中应包含至少 2 条带“主体线索/数据线索/趋势判断”的信息
5. 禁止空泛模板：不得批量出现“出现新的变化信号，建议对照原文核对主体、时间与数据”这类无信息句

## 工作流（与 STDD 衔接）

1. 更新 `spec/`（用例 + 契约）  
2. 实现 `services/api` / `apps/web`  
3. **`npm test`**（或 `verify` + `test:features`）  
4. **按上表做功能点验证**（自动化未覆盖的交互须 curl / 页面确认）  
5. 向用户汇报时写明：改了什么、跑了什么测试、结果如何  

## 禁止

- 未跑 `npm test`（或 verify + test:features）即宣称功能完成  
- 新增 API 但未更新 `verify.mjs` / `test-features.mjs`  
- 仅改前端交互却不验证对应后端契约（若存在）  

## Agent 汇报模板（建议）

```
## 测试验证
- npm test：✅（verify + test:features）
- 功能点：[列出实际执行的步骤与结果]
```
