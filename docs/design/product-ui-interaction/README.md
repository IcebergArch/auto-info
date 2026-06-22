# Track 1：产品界面与交互重构

## 背景与目标

Auto Info 的主要页面已经具备可用能力，但页面交互是在多个用例迭代中逐步形成的：日报、分析、阅读助手、科技雷达都使用报告体与历史侧栏，但细节仍存在命名、布局、空状态、来源跳转、展开收起行为不完全统一的问题。

本 Track 目标是从产品设计角度统一界面与交互，让用户形成稳定心智：

- 左侧完成主任务，右侧只做历史/资料选择。
- 报告类内容统一用 `report-document` + `ReportSection`。
- 来源跳转只通过 `SourceJumpLink`。
- 列表、时间线、Card、历史项、空状态和错误状态保持一致。

## 当前问题

- 首页、阅读助手、分析、科技雷达都采用 8:2 主侧栏，但细节状态不完全一致。
- 时间线组件已在日报与科技雷达中逐渐复用，但左侧时间、折叠节点、Card 密度仍需统一。
- 历史列表与资料列表职责相近，但交互文案和选中态需要收敛。
- 错误/空状态存在不同表达，用户不容易判断是“无内容”“抓取失败”还是“需要补充输入”。
- 移动端下侧栏、报告体和输入区的优先级需要明确。

## 范围内

页面：

- `apps/web-react/src/pages/HomePage.tsx`
- `apps/web-react/src/pages/AnalysisPage.tsx`
- `apps/web-react/src/pages/ReadingPage.tsx`
- `apps/web-react/src/pages/TechRadarPage.tsx`
- `apps/web-react/src/pages/ConfigPage.tsx`
- `apps/web-react/src/pages/QuickAccessPage.tsx`

组件：

- `apps/web-react/src/components/report/ReportSection.tsx`
- `apps/web-react/src/components/report/EventTimeline.tsx`
- `apps/web-react/src/components/report/SourceJumpLink.tsx`
- `apps/web-react/src/components/DailyReportCard.tsx`
- `apps/web-react/src/components/ReadingBriefDocument.tsx`
- `apps/web-react/src/components/analysis/AnalysisLayeredStack.tsx`
- `apps/web-react/src/components/tech-radar/*`

样式与设计约束：

- `apps/web-react/src/styles/app.css`
- `spec/constraints/UI-DESIGN.md`

## 范围外

- 不重新定义 UC/API 业务边界；该工作属于 Track 2。
- 不做后端存储、抓取、摘要质量重构；该工作属于 Track 3。
- 不引入新的 UI 框架或双份组件库。

## 方案

### 1. 页面结构统一

| 页面 | 主区 | 侧栏 | 首屏主任务 |
|---|---|---|---|
| 首页 | 搜索 + 今日日报 | 日期/归档筛选 | 查看今日与搜索事件 |
| 分析 | 查询 + 脉络图/图层 | 历史列表 | 分析事件关联 |
| 阅读助手 | 输入 + 简报 | 历史列表 | 粘贴资料生成简报 |
| 科技雷达 | 时间线 | 相关资料 | 浏览 AI 技术动态 |
| 配置 | 链路状态与编辑 | 无或轻辅助 | 检查/编辑配置 |
| 快捷访问 | 启动器 | URL 目录 | 打开常用链接 |

原则：

- 侧栏不重复主区正文。
- 主输入区固定高度，不因报告展开收起变形。
- 报告区内部滚动，页面主体保持铺满视口。

### 2. 组件语言统一

报告：

- `report-document` 承载内容流。
- `ReportSection` 负责标题、计数、起止时间、展开状态。
- 标题纯文本，外链统一用 `SourceJumpLink`。

时间线：

- `EventTimeline` 作为基础时间线组件。
- 日报：左侧时间 + 圆点/连接线 + Event Card；无时间条目归「当前」。
- 科技雷达：左侧月份/年份节点 + 折叠 Card；月/周/日条目在 Card 内展开。

历史与资料：

- 历史项统一包含：标题、更新时间、摘要预览。
- 资料项统一包含：来源标题、provider、↗。
- 选中态只表示“当前主区内容来源”，不承担过滤语义。

### 3. 交互状态统一

| 状态 | 标准表达 |
|---|---|
| 加载中 | `加载中…`，不阻断已有内容 |
| 空内容 | `—` 或一行具体原因 |
| 抓取失败 | 解释失败原因与下一步输入方式 |
| 低信号输入 | 明确要求补充正文/字幕/转写 |
| 历史损坏 | 保留列表，主区显示可恢复提示 |
| 来源跳转 | 仅 ↗ 打开原文 |

### 4. 响应式策略

- 桌面：主区 8 / 侧栏 2。
- 窄屏：主区优先，侧栏下移或折叠为列表。
- 输入区保持紧凑，按钮不横向拉伸，除非移动端明确需要整行按钮。

## 影响文件

- `spec/constraints/UI-DESIGN.md`
- `apps/web-react/src/styles/app.css`
- `apps/web-react/src/pages/*.tsx`
- `apps/web-react/src/components/**/*.tsx`

## 验收标准

- 六个页面的主任务路径清晰，侧栏不重复主区正文。
- 报告、时间线、来源跳转、历史列表、空状态使用统一语言。
- UI 改动完成后 Design 审查结论为 `通过`。
- `npm --prefix apps/web-react run build` 通过。
- 若 UI 改动影响行为，补充对应功能测试并执行 `npm test`。

## 风险与回滚

风险：

- 过早抽象组件可能掩盖不同业务场景差异。
- 大范围 CSS 调整可能影响已有页面高度链与滚动行为。
- 折叠/历史交互变化可能让老用户短期不适应。

回滚：

- 每次仅以页面或组件簇为单位提交改动。
- 保留旧组件直到新组件覆盖所有调用点并通过测试。
- 若 Design 审查驳回，先回退对应页面样式，不牵连功能/API。

## 审查记录

| 阶段 | 结论 | 说明 |
|---|---|---|
| Product 发起 | 已执行 | 2026-06-04 启动 Track 1 落地审查 |
| Design 审查（令牌层） | 部分通过 | 静态代码审查：补齐 --positive/--negative/--neutral/--font 令牌、收口硬编码 hex；页面级布局/组件已符合约束。截图级 Design 审查待本机执行 |
| Quality 验证 | 部分通过 | audit/verify 通过；CSS 语法配平、零未定义令牌。vite build 因沙盒断网未执行，待本机 |
| Product 验收 | 待本机 | 空/错/载文案统一与 app.css 模块化拆分需 build + 截图验证，移交本机 |

> 执行记录：agent-hub/reports/auto-info/review/关于auto-info-track1UiTokenReview.md
