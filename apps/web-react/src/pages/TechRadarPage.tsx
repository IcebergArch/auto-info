import { useCallback, useEffect, useMemo, useState } from "react";
import { ReportSection } from "../components/report/ReportSection";
import { WorkspaceHero } from "../components/report/WorkspaceHero";
import { TechRadarNestedTimeline } from "../components/tech-radar/TechRadarNestedTimeline";
import {
  TechRadarMaterialsSidebar,
  type TechRadarMaterial
} from "../components/tech-radar/TechRadarMaterialsSidebar";
import { fetchJson } from "../lib/api";
import { reportStatusLabel, reportStatusTone, type ReportStatus } from "../lib/reportStatus";
import { resolveTechRadarTimeline } from "../lib/techRadarTimelineFromFeed";
import type {
  TechRadarEntry,
  TechRadarRefreshCutoff,
  TechRadarTimelineNode
} from "../components/tech-radar/types";
import { formatDateKeyMd, formatEntryRangeLabel } from "../components/tech-radar/techRadarFormat";
import { useAppStore } from "../stores/useAppStore";

import { useRefreshIntervalMs } from "../hooks/useRefreshInterval";

type FeedPayload = {
  timeline?: TechRadarTimelineNode[];
  recent: TechRadarEntry[];
  archives: TechRadarEntry[];
  relatedMaterials: TechRadarMaterial[];
  selectedEntryId?: string | null;
  refreshIntervalHours?: number;
  nextRefreshAt?: string;
  refreshCutoff?: TechRadarRefreshCutoff;
  recentEmptyDays?: string[];
  recentCutoff?: string;
  recentEnd?: string;
  todayWindow?: { status?: ReportStatus };
};

function formatNextRefresh(nextRefreshAt?: string) {
  if (!nextRefreshAt) return "";
  const d = new Date(nextRefreshAt);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function flattenEntries(timeline: TechRadarTimelineNode[] = []): TechRadarEntry[] {
  const out: TechRadarEntry[] = [];
  const walk = (nodes: TechRadarTimelineNode[]) => {
    for (const node of nodes) {
      if (node.kind === "entry" && node.entry) out.push(node.entry);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(timeline);
  return out;
}

export function TechRadarPage() {
  const { refreshMs, refreshHours } = useRefreshIntervalMs();
  const openReadingSession = useAppStore((s) => s.openReadingSession);
  const [timeline, setTimeline] = useState<TechRadarTimelineNode[]>([]);
  const [materials, setMaterials] = useState<TechRadarMaterial[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nextRefreshAt, setNextRefreshAt] = useState<string | undefined>();
  const [refreshCutoff, setRefreshCutoff] = useState<TechRadarRefreshCutoff | undefined>();
  const [recentEmptyDays, setRecentEmptyDays] = useState<string[]>([]);
  const [feedRefreshHours, setFeedRefreshHours] = useState(refreshHours);
  const [recentCutoff, setRecentCutoff] = useState<string | undefined>();
  const [recentEnd, setRecentEnd] = useState<string | undefined>();
  const [feedStatus, setFeedStatus] = useState<ReportStatus | undefined>();
  const [repairStatus, setRepairStatus] = useState("");
  const [repairing, setRepairing] = useState(false);

  const loadFeed = useCallback(async (entryId?: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError("");
    try {
      const q = entryId ? `?entryId=${encodeURIComponent(entryId)}&_=${Date.now()}` : `?_=${Date.now()}`;
      const payload = await fetchJson<FeedPayload>(`/api/v1/tech-radar/feed${q}`);
      const nodes = resolveTechRadarTimeline(
        payload.timeline,
        payload.recent || [],
        payload.archives || [],
        payload.recentEnd
      );
      setFeedRefreshHours(payload.refreshIntervalHours ?? refreshHours);
      setTimeline(nodes);
      setRecentCutoff(payload.recentCutoff);
      setRecentEnd(payload.recentEnd);
      setRefreshCutoff(payload.refreshCutoff);
      setRecentEmptyDays(payload.recentEmptyDays || []);
      setFeedStatus(payload.todayWindow?.status);
      const flat = flattenEntries(nodes);
      const id = entryId || payload.selectedEntryId || null;
      setSelectedId(id);
      const selected = flat.find((e) => e.id === id);
      setSelectedTitle(selected?.title || "");
      setMaterials(
        payload.relatedMaterials?.length
          ? payload.relatedMaterials
          : selected
            ? (selected.sources || []).map((s, index) => ({
                id: `${selected.id}-src-${index}`,
                entryId: selected.id,
                title: s.title,
                url: s.url,
                provider: s.provider
              }))
            : []
      );
      setNextRefreshAt(payload.nextRefreshAt);
    } catch (loadError) {
      setError((loadError as Error).message || "科技雷达加载失败");
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [refreshHours]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadFeed(selectedId ?? undefined, { silent: true });
    }, refreshMs);
    return () => window.clearInterval(timer);
  }, [loadFeed, selectedId, refreshMs]);

  const timelineRange = useMemo(() => {
    const flat = flattenEntries(timeline);
    return formatEntryRangeLabel(flat) || (recentCutoff && recentEnd
      ? `${formatDateKeyMd(recentCutoff)} — ${formatDateKeyMd(recentEnd)}`
      : "");
  }, [timeline, recentCutoff, recentEnd]);

  const entryCount = useMemo(() => flattenEntries(timeline).length, [timeline]);

  const repairArchives = async () => {
    setRepairing(true);
    setRepairStatus("");
    try {
      const result = await fetchJson<{ repaired?: number }>("/api/v1/tech-radar/repair-archives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true })
      });
      setRepairStatus(`已充实 ${result.repaired ?? 0} 条`);
      await loadFeed(selectedId ?? undefined);
    } catch (repairError) {
      setRepairStatus((repairError as Error).message || "失败");
    } finally {
      setRepairing(false);
    }
  };

  const selectEntry = (entry: TechRadarEntry) => {
    setSelectedId(entry.id);
    setSelectedTitle(entry.title);
    const fromEntry =
      entry.sources?.map((s, index) => ({
        id: `${entry.id}-src-${index}`,
        entryId: entry.id,
        title: s.title,
        url: s.url,
        provider: s.provider
      })) || [];
    setMaterials(fromEntry);
    void loadFeed(entry.id);
  };

  return (
    <section className="panel tech-radar-layout reading-layout">
      <WorkspaceHero
        eyebrow="AI Tech Radar"
        title="科技雷达"
        description="跟踪 AI 平台、论文与工程热词；今日到分钟，往期按天与周月归档。"
        stats={[
          { label: "范围", value: timelineRange || "—", tone: "accent" },
          { label: "条目", value: entryCount },
          { label: "来源状态", value: reportStatusLabel(feedStatus), tone: reportStatusTone(feedStatus) },
          { label: "时间精度", value: "今日 HH:mm" },
          { label: "下次刷新", value: nextRefreshAt ? `${formatNextRefresh(nextRefreshAt)} · ${feedRefreshHours}h` : `${feedRefreshHours}h`, tone: "muted" }
        ]}
        actions={
          <button type="button" className="btn btn-secondary" disabled={repairing} onClick={() => void repairArchives()}>
            {repairing ? "充实中…" : "充实往期月报"}
          </button>
        }
      />
      {error ? <p className="error-text">{error}</p> : null}
      {repairStatus ? <span className="tech-radar-repair-status">{repairStatus}</span> : null}
      <div className="tech-radar-grid">
        <div className="tech-radar-main">
          <div className="tech-radar-timeline-scroll report-document daily-report-timeline tech-radar-timeline">
            {loading ? <p className="result-text">加载中…</p> : null}
            {!loading ? (
              <ReportSection title="时间线" range={timelineRange} count={entryCount} defaultOpen>
                <TechRadarNestedTimeline
                  timeline={timeline}
                  selectedId={selectedId}
                  onSelect={selectEntry}
                  onOpenBriefing={openReadingSession}
                  refreshCutoff={refreshCutoff}
                  recentCutoff={recentCutoff}
                  recentEmptyDays={recentEmptyDays}
                />
              </ReportSection>
            ) : null}
          </div>
        </div>
        <TechRadarMaterialsSidebar materials={materials} selectedTitle={selectedTitle} />
      </div>
    </section>
  );
}
