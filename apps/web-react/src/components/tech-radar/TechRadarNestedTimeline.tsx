import { useMemo, useState, type ReactNode } from "react";
import { TimelineRefreshCutoffRow, type TimelineRefreshCutoffItem } from "../timeline/TimelineRefreshCutoff";
import { TechRadarTimelineEntry } from "./TechRadarTimelineEntry";
import type { TechRadarEntry, TechRadarTimelineNode, TechRadarRefreshCutoff } from "./types";
import {
  formatDateKeyMd,
  formatEntryDayLabel,
  formatEntryPeriodLabel,
  isEntryOnToday
} from "./techRadarFormat";

function nodeRangeLabel(node: TechRadarTimelineNode) {
  if (node.periodLabel) return node.periodLabel;
  if (node.kind === "entry" && node.entry) return formatEntryPeriodLabel(node.entry);
  if (node.periodStart && node.periodEnd) {
    const fmt = (key: string) => {
      const [, m, d] = key.split("-");
      return `${Number(m)}.${d}`;
    };
    const start = fmt(node.periodStart);
    const end = fmt(node.periodEnd);
    return start === end ? start : `${start} — ${end}`;
  }
  return "";
}

function shouldShowNodeRange(node: TechRadarTimelineNode) {
  return node.kind !== "month";
}

function dayGroupLabel(entry: TechRadarEntry) {
  if (entry.granularity !== "day") return "";
  return formatEntryDayLabel(entry);
}

function groupEntryLeaves(leaves: TechRadarTimelineNode[]) {
  const groups: Array<{ id: string; label: string; leaves: TechRadarTimelineNode[] }> = [];
  for (const leaf of leaves) {
    if (!leaf.entry) continue;
    const label = dayGroupLabel(leaf.entry);
    if (!label) {
      groups.push({ id: leaf.id, label: "", leaves: [leaf] });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.leaves.push(leaf);
    } else {
      groups.push({ id: `day-${label}-${leaf.id}`, label, leaves: [leaf] });
    }
  }
  return groups;
}

/** 与 event-timeline 左轴对齐的日节点行（refreshCutoff 之下连续连线） */
function TechRadarDaySlotRow({
  dateLabel,
  showConnector = true,
  children
}: {
  dateLabel: string;
  showConnector?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="event-timeline-item tech-radar-day-slot">
      <time className="event-timeline-left-time">
        <span className="event-timeline-left-date">{dateLabel}</span>
      </time>
      <div className="event-timeline-rail" aria-hidden>
        <span className="event-timeline-dot" />
        {showConnector ? <span className="event-timeline-connector" /> : null}
      </div>
      <div className="tech-radar-day-slot-body">{children}</div>
    </li>
  );
}

function EmptyDaySlotBody() {
  return (
    <section className="tech-radar-day-group tech-radar-empty-day tech-radar-day-slot-card">
      <div className="tech-radar-day-slot-meta">
        <span className="tech-radar-day-group-count">0 条</span>
      </div>
      <p className="report-timeline-overview">暂无科技雷达条目。</p>
    </section>
  );
}

function toRefreshCutoffItem(cutoff?: TechRadarRefreshCutoff): TimelineRefreshCutoffItem | null {
  if (!cutoff?.isRefreshCutoff) return null;
  return {
    id: cutoff.id,
    at: cutoff.at,
    title: cutoff.title || cutoff.displayTitle || "上次更新",
    desc: cutoff.desc,
    isRefreshCutoff: true
  };
}

function buildRecentDaySlots({
  refreshCutoff,
  recentCutoff,
  recentEmptyDays,
  entryGroups,
  todayDate
}: {
  refreshCutoff?: TechRadarRefreshCutoff;
  recentCutoff?: string;
  recentEmptyDays?: string[];
  entryGroups: Array<{ id: string; label: string; leaves: TechRadarTimelineNode[] }>;
  todayDate?: string;
}) {
  if (!refreshCutoff?.date && !todayDate && !recentCutoff) {
    return entryGroups.map((group) => ({ kind: "entries" as const, group }));
  }

  const today = refreshCutoff?.at?.slice(0, 10) || todayDate || "";
  if (!today || !recentCutoff) {
    return entryGroups.map((group) => ({ kind: "entries" as const, group }));
  }

  const emptySet = new Set(recentEmptyDays || []);
  const groupByLabel = new Map(entryGroups.filter((group) => group.label).map((group) => [group.label, group]));
  const unlabeled = entryGroups.filter((group) => !group.label);
  const slots: Array<
    | { kind: "refresh-cutoff" }
    | { kind: "empty-day"; dateKey: string }
    | { kind: "entries"; group: { id: string; label: string; leaves: TechRadarTimelineNode[] } }
  > = [{ kind: "refresh-cutoff" }];

  let cur = today;
  while (cur >= recentCutoff) {
    const label = formatDateKeyMd(cur);
    if (cur === today) {
      if (groupByLabel.has(label)) slots.push({ kind: "entries", group: groupByLabel.get(label)! });
    } else if (emptySet.has(cur)) {
      slots.push({ kind: "empty-day", dateKey: cur });
    } else if (groupByLabel.has(label)) {
      slots.push({ kind: "entries", group: groupByLabel.get(label)! });
    }

    if (cur === recentCutoff) break;
    const d = new Date(`${cur}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cur = d.toISOString().slice(0, 10);
  }

  for (const group of unlabeled) {
    slots.push({ kind: "entries", group });
  }

  return slots;
}

function FoldCard({
  node,
  selectedId,
  onSelect,
  onOpenBriefing,
  refreshCutoff,
  recentCutoff,
  recentEmptyDays,
  depth = 0,
  variant = "nested"
}: {
  node: TechRadarTimelineNode;
  selectedId: string | null;
  onSelect: (entry: TechRadarEntry) => void;
  onOpenBriefing?: (sessionId: string) => void;
  refreshCutoff?: TechRadarRefreshCutoff;
  recentCutoff?: string;
  recentEmptyDays?: string[];
  depth?: number;
  variant?: "root" | "nested";
}) {
  const [open, setOpen] = useState(
    node.defaultExpanded ?? (node.children?.length ? depth === 0 : false)
  );
  const range = nodeRangeLabel(node);
  const childCount = node.children?.length || 0;
  const showTitleInHeader = variant !== "root";
  const cutoffItem = toRefreshCutoffItem(refreshCutoff);
  const todayDate = refreshCutoff?.at?.slice(0, 10) || "";

  if (node.kind === "entry" && node.entry) {
    return (
      <div className={`tech-radar-fold-leaf depth-${depth}`}>
        <TechRadarTimelineEntry
          entry={node.entry}
          selected={selectedId === node.entry.id}
          onSelect={onSelect}
          onOpenBriefing={onOpenBriefing}
          expandable={
            node.entry.granularity === "week" ||
            node.entry.granularity === "month" ||
            node.entry.granularity === "day"
          }
        />
      </div>
    );
  }

  const entryLeaves = node.children?.filter((c) => c.kind === "entry") || [];
  const nestedGroups = node.children?.filter((c) => c.kind !== "entry") || [];
  const entryGroups = groupEntryLeaves(entryLeaves);
  const showRecentDaySlots =
    depth === 0 &&
    refreshCutoff &&
    recentCutoff &&
    todayDate &&
    node.kind === "month" &&
    node.id === `tr-month-${todayDate.slice(0, 7)}`;
  const daySlots = showRecentDaySlots
    ? buildRecentDaySlots({
        refreshCutoff,
        recentCutoff,
        recentEmptyDays,
        entryGroups,
        todayDate
      })
    : entryGroups.map((group) => ({ kind: "entries" as const, group }));
  const hasDayContent = daySlots.length > 0;

  return (
    <div className={`tech-radar-fold-group depth-${depth}`}>
      <button
        type="button"
        className={`tech-radar-fold-header${open ? " is-open" : ""}${variant === "root" ? " tech-radar-fold-header-root" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="tech-radar-fold-chevron" aria-hidden />
        {showTitleInHeader ? <span className="tech-radar-fold-title">{node.label}</span> : null}
        {showTitleInHeader && range && shouldShowNodeRange(node) ? <span className="tech-radar-fold-range">{range}</span> : null}
        {childCount ? <span className="tech-radar-fold-count">{childCount}</span> : null}
      </button>
      {open && (node.children?.length || hasDayContent) ? (
        <div className="tech-radar-fold-children">
          {hasDayContent ? (
            <ol
              className={`event-timeline tech-radar-recent-day-timeline${showRecentDaySlots ? "" : " tech-radar-day-group-stack"}`}
              aria-label={showRecentDaySlots ? "近窗口时间线" : undefined}
            >
              {daySlots.map((slot, index) => {
                const isLast = index === daySlots.length - 1;
                const showConnector = !isLast;

                if (slot.kind === "refresh-cutoff" && cutoffItem) {
                  return (
                    <TimelineRefreshCutoffRow
                      key={cutoffItem.id}
                      item={cutoffItem}
                      showDate
                      connectorDashed={showConnector}
                      showConnector={showConnector}
                    />
                  );
                }

                if (slot.kind === "empty-day") {
                  return (
                    <TechRadarDaySlotRow
                      key={`empty-${slot.dateKey}`}
                      dateLabel={formatDateKeyMd(slot.dateKey)}
                      showConnector={showConnector}
                    >
                      <EmptyDaySlotBody />
                    </TechRadarDaySlotRow>
                  );
                }

                const group = slot.group;
                return (
                  <TechRadarDaySlotRow
                    key={group.id || `entries-${index}`}
                    dateLabel={group.label || "—"}
                    showConnector={showConnector}
                  >
                    <section
                      className={
                        group.label ? "tech-radar-day-group tech-radar-day-slot-card" : "tech-radar-single-entry-group"
                      }
                    >
                      {group.label ? (
                        <div className="tech-radar-day-slot-meta">
                          <span className="tech-radar-day-group-count">{group.leaves.length} 条</span>
                        </div>
                      ) : null}
                      <ol className="report-timeline-list tech-radar-fold-entry-list">
                        {group.leaves.map((child) =>
                          child.entry ? (
                            <li key={child.id}>
                              <TechRadarTimelineEntry
                                entry={child.entry}
                                selected={selectedId === child.entry.id}
                                onSelect={onSelect}
                                onOpenBriefing={onOpenBriefing}
                                hidePeriodLabel={Boolean(group.label) && !isEntryOnToday(child.entry)}
                                expandable={
                                  child.entry.granularity === "week" || child.entry.granularity === "month"
                                }
                              />
                            </li>
                          ) : null
                        )}
                      </ol>
                    </section>
                  </TechRadarDaySlotRow>
                );
              })}
            </ol>
          ) : null}
          {nestedGroups.map((child) => (
            <FoldCard
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              onOpenBriefing={onOpenBriefing}
              refreshCutoff={refreshCutoff}
              recentCutoff={recentCutoff}
              recentEmptyDays={recentEmptyDays}
              depth={depth + 1}
              variant="nested"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TechRadarNestedTimeline({
  timeline,
  selectedId,
  onSelect,
  onOpenBriefing,
  refreshCutoff,
  recentCutoff,
  recentEmptyDays
}: {
  timeline: TechRadarTimelineNode[];
  selectedId: string | null;
  onSelect: (entry: TechRadarEntry) => void;
  onOpenBriefing?: (sessionId: string) => void;
  refreshCutoff?: TechRadarRefreshCutoff;
  recentCutoff?: string;
  recentEmptyDays?: string[];
}) {
  const roots = useMemo(() => timeline, [timeline]);

  if (!roots.length) {
    return <p className="result-text tech-radar-empty">—</p>;
  }

  return (
    <div className="tech-radar-nested-timeline" aria-label="科技雷达时间线">
      <ol className="event-timeline tech-radar-event-timeline">
        {roots.map((node, index) => {
          const isLast = index === roots.length - 1;
          const range = nodeRangeLabel(node);
          return (
            <li key={node.id} className="event-timeline-item tech-radar-timeline-root">
              <time className="event-timeline-left-time">
                <span className="event-timeline-left-clock">{node.label}</span>
                {range && shouldShowNodeRange(node) ? <span className="event-timeline-left-date">{range}</span> : null}
              </time>
              <div className="event-timeline-rail" aria-hidden>
                <span className="event-timeline-dot" />
                {!isLast ? <span className="event-timeline-connector" /> : null}
              </div>
              <div className="tech-radar-fold-root-body">
                <FoldCard
                  node={node}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onOpenBriefing={onOpenBriefing}
                  refreshCutoff={refreshCutoff}
                  recentCutoff={recentCutoff}
                  recentEmptyDays={recentEmptyDays}
                  variant="root"
                />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
