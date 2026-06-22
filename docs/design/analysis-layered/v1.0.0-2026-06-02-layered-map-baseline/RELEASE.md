# v1.0.0 — 分层地图基线（2026-06-02）

## 变更摘要

- 移除分析关联边与图上冗余前缀 **「共享标签：」**；短标签如 `地缘、冲突`。
- 影响域泳道：**政治 · 金融 · 科技**（原「风险」并入政治/地缘维度）。
- API `eventLines` 新增 `mapLayer`、`dimensionLayers`。
- 前端 `AnalysisLayeredStack`：维度图层切换 + 地区关联列表（无世界地图 SVG；v1.2 地图试验已撤销）。
- 下方保留 `EventLinesChart` 时间轴。

## 规格

- `spec/use-cases/UC-002-event-tag-analysis.md`（§ 分层地图）
- `spec/constraints/UI-DESIGN.md`（§ 分析分层）

## 代码

| 区域 | 路径 |
|------|------|
| 地区聚合 | `services/api/.../region-map.mjs` |
| 脉络构建 | `services/api/.../event-lines-build.mjs` |
| 图谱边 | `services/api/.../service.mjs` |
| UI | `apps/web-react/src/components/analysis/*` |

## 测试

- `scripts/test-region-map.mjs`
- `scripts/test-impact-label.mjs`（边标签）

## Figma

见 [FIGMA.md](./FIGMA.md)（待链入猎户座设计库文件）。

## 下一版（v1.1.0 候选）

- 点击地区筛选下方时间轴节点
- 分层卡片与时间轴双向高亮
