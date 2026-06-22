# 规则事件日志（非门禁，仅留档）

历史批次复盘从 `ISSUE-CLOSURE-REVIEW.md` 迁出，避免门禁文档膨胀。

## 2026-05-29 用户提报

| # | 问题 | 根因 | Rule Delta |
|---|------|------|------------|
| 1 | 日报侧栏应仅筛选 | UC-001 与 UI 冲突 | UC-001、UI-DESIGN |
| 2 | 事件缺来源跳转 | 无 SourceJumpLink 约束 | UI-DESIGN |
| 3 | 报告折叠顶高搜索区 | 未约束 flex | UI-DESIGN |
| 4 | 阅读简报难读 | 未绑定 ReadingBriefDocument | UI-DESIGN |
| 5 | 报告版式不统一 | 缺 report-document | UI-DESIGN |
| 6 | Neo4j embed 路由 | iframe 代理路径 | UC-005（后改为新窗口） |
| 7 | 分析脉络不可见 | SVG/默认展开 | UI-DESIGN |
| 8 | 快捷访问 iframe | SSO/iframe 不可靠 | UC-005 新窗口 |
| 9 | 阅读英文未转中文 | summary 直出英文 | UC-003、chinese-brief |
