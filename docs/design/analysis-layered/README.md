# 分析脉络 — 分层地图设计归档

猎户座 Auto Info · UC-002 分析页「地图底 + 领域层」迭代文档。命名遵循 [Semantic Versioning](https://semver.org/) + ISO 日期：

`v{MAJOR}.{MINOR}.{PATCH}-{YYYY-MM-DD}-{slug}/`

## 目录

| 版本 | 目录 | 状态 |
|------|------|------|
| v1.0.0 | [v1.0.0-2026-06-02-layered-map-baseline](./v1.0.0-2026-06-02-layered-map-baseline/) | 已交付（代码 + 规格） |
| v1.2.0 | [v1.2.0-2026-06-01-layer-switch-nav](./v1.2.0-2026-06-01-layer-switch-nav/) | 已交付：图层切换 + 30° 宽地图 |
| v1.1.0 | `v1.1.0-*-region-filter` | 计划：地区筛选联动时间轴 |
| v2.0.0 | `v2.0.0-*-figma-parity` | 计划：Figma 高保真 + 动效 |

## 设计原则

1. **底层**：示意世界地图（欧洲、中东、非洲、亚洲、澳大拉西亚、美洲），非 GIS 精确边界。
2. **上层**：政治 / 金融 / 科技 三域分层（CSS 透视），替代原「风险」泳道。
3. **底层之下**：保留时间轴脉络图（主事件 + 外溢箭头 + 时间刷选）。
4. **关联文案**：图谱边标签直接展示标签名（如 `地缘、冲突`），禁止前缀「共享标签：」。

## Figma

各版本 `FIGMA.md` 记录文件链接与画板名。无链接时由 `/loop` 迭代补全。

## Loop

`scripts/loop-analysis-design-iterate.mjs` — 动态唤醒后续 v1.1 / v2.0 设计与实现（见脚本注释）。
