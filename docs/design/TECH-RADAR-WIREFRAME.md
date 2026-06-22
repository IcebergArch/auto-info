# 科技雷达 — 线框（Figma 对齐稿）

> 实现 SSOT：`spec/use-cases/UC-006-ai-tech-radar.md`、`spec/contracts/API-uc-006-tech-radar.md`  
> 视觉令牌：`spec/constraints/UI-DESIGN.md` §科技雷达

## 布局 8:2（`tech-radar-grid`）

```
┌─────────────────────────────────────────────────────────────┬──────────────┐
│ 科技雷达                                                     │ 相关资料      │
├─────────────────────────────────────────────────────────────┤              │
│ ▼ 近期热词与论文（report-timeline 时间线）                     │ （选中条目后  │
│  2026/6/1  │ ○ 热词  cursor: loop 功能              ↗      │  显示链接列表 │
│            │      简述：Agent 定时唤醒…                     │  或空态提示） │
│            │      [查看简报]                                │              │
│  2026/6/1  │ ○ 热词  harness 工程 …                       │              │
│                                                              │              │
│ ▼ 往期月报（同 timeline 样式）                               │              │
│  2026/05   │ ○ 月报  工程共识…  [展开详细信息]              │              │
└─────────────────────────────────────────────────────────────┴──────────────┘
```

## 组件映射

| 线框区域 | React 组件 | 令牌 |
|---------|-----------|------|
| 左主区 | `TechRadarPage` + `ReportSection` | `--surface`, `--radius` |
| 近期列表 | `TechRadarFeed` + `TechRadarTimelineEntry` | `report-timeline-*`（同日报时间线） |
| 月报 | `TechRadarTimelineEntry` `expandable` | 渐进披露 |
| 右栏 | `TechRadarMaterialsSidebar` | 同 `reading-history` 宽度比例 |

## Figma

团队 Figma 文件待建时，以本线框 + 阅读助手页截图为参考帧；间距：主区内边距 16px，条目间距 12px，标题 15px/600，简述 14px/400 `--muted`。
