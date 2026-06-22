import type { TechRadarEntry, TechRadarTimelineNode } from "../components/tech-radar/types";

/** API 未带 timeline 时，由 recent + archives 组装（与后端结构对齐的简化版） */
export function techRadarTimelineFromFeed(
  recent: TechRadarEntry[],
  archives: TechRadarEntry[],
  recentEnd?: string
): TechRadarTimelineNode[] {
  if (!recent.length && !archives.length) return [];

  const today = recentEnd?.slice(0, 10) || new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const monthArchives = archives.filter((e) => e.granularity === "month");
  const otherArchives = archives.filter((e) => e.granularity !== "month");

  const timeline: TechRadarTimelineNode[] = [];

  const currentChildren = [...recent, ...otherArchives].map((entry) => ({
    kind: "entry" as const,
    id: entry.id,
    entry
  }));

  timeline.push({
    kind: "month",
    id: `tr-month-${currentMonth}`,
    label: `${Number(currentMonth.slice(5, 7))}月`,
    periodStart: `${currentMonth}-01`,
    periodEnd: today,
    defaultExpanded: currentChildren.length > 0,
    children: currentChildren
  });

  for (const entry of monthArchives) {
    const mk =
      entry.periodStart?.slice(0, 7) ||
      entry.occurredAt?.slice(0, 7) ||
      entry.id.replace(/^tech-month-/, "");
    if (!mk || mk >= currentMonth) continue;
    timeline.push({
      kind: "month",
      id: `tr-month-${mk}`,
      label: `${Number(mk.slice(5, 7))}月`,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      periodLabel: entry.term,
      defaultExpanded: false,
      children: [{ kind: "entry", id: entry.id, entry }]
    });
  }

  return timeline;
}

export function resolveTechRadarTimeline(
  timeline: TechRadarTimelineNode[] | undefined,
  recent: TechRadarEntry[],
  archives: TechRadarEntry[],
  recentEnd?: string
) {
  if (timeline?.length) return timeline;
  return techRadarTimelineFromFeed(recent, archives, recentEnd);
}
