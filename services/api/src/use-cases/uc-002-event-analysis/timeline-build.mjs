/** 分析脉络：按时间范围聚合事件，历史时期粗粒度、近期细粒度 */

import {
  isIngestPlaceholderText,
  presentEventForReport,
  resolveTimelinePointText
} from "../uc-001-daily-events/event-display.mjs";
import { resolveAnalysisWindow, isLongConflictQuery } from "./analysis-window.mjs";
import { buildTimeAxisScale } from "./time-axis-scale.mjs";

const PHASE_DEFS = [
  { key: "background", label: "背景与起因" },
  { key: "outbreak", label: "爆发/起点" },
  { key: "core", label: "过程核心" },
  { key: "turning", label: "重大变动" },
  { key: "progress", label: "进展" },
  { key: "recent", label: "近期变化" }
];

const PHASE_CAPS = { background: 2, outbreak: 2, core: 4, turning: 3, progress: 4, recent: 14 };

function toIso(d) {
  return new Date(d).toISOString();
}

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function inferLevel(event) {
  if (event.level) return event.level;
  if (event.special || Number(event.severity || 0) >= 85) return "core";
  if (Number(event.severity || 0) >= 72) return "important";
  return "context";
}

function collectRawPoints(events, startTs, endTs) {
  const points = [];
  for (const event of events) {
    const level = inferLevel(event);
    const timeline = Array.isArray(event.timeline) ? event.timeline : [];
    for (const point of timeline) {
      const ts = new Date(point.at || event.occurredAt).getTime();
      if (!Number.isFinite(ts) || ts < startTs || ts > endTs) continue;
      const text = resolveTimelinePointText(event, point);
      if (!text || /暂无新增原始事件/.test(text) || isIngestPlaceholderText(text)) continue;
      const presented = presentEventForReport(event);
      points.push({
        at: toIso(ts),
        title: presented.displayTitle || event.title,
        text,
        eventId: event.id,
        eventTitle: event.title,
        level,
        source: "timeline"
      });
    }
    const occurredTs = new Date(event.occurredAt || 0).getTime();
    if (Number.isFinite(occurredTs) && occurredTs >= startTs && occurredTs <= endTs) {
      const hasTimeline = points.some((p) => p.eventId === event.id);
      if (!hasTimeline) {
        const presented = presentEventForReport(event);
        const text = presented.desc || presented.summary || "";
        if (text && !isIngestPlaceholderText(text)) {
          points.push({
            at: toIso(occurredTs),
            title: presented.displayTitle || event.title,
            text,
            eventId: event.id,
            eventTitle: event.title,
            level,
            source: "event"
          });
        }
      }
    }
  }

  const seen = new Set();
  return points
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .filter((point) => {
      const key = `${dayKey(point.at)}|${point.eventId}|${point.text.slice(0, 48)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function granularityForAgeDays(ageDays) {
  if (ageDays > 1095) return "year";
  if (ageDays > 540) return "half-year";
  if (ageDays > 120) return "quarter";
  if (ageDays > 45) return "month";
  if (ageDays > 10) return "week";
  return "day";
}

function bucketKey(date, granularity) {
  const d = new Date(date);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  if (granularity === "year") return `${y}`;
  if (granularity === "half-year") return `${y}-H${m <= 6 ? 1 : 2}`;
  if (granularity === "quarter") return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
  if (granularity === "month") return `${y}-${String(m).padStart(2, "0")}`;
  if (granularity === "week") {
    const jan1 = new Date(Date.UTC(y, 0, 1));
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getUTCDay() + 1) / 7);
    return `${y}-W${String(week).padStart(2, "0")}`;
  }
  return dayKey(d);
}

function bucketLabel(key, granularity) {
  if (granularity === "year") return `${key} 年`;
  if (granularity === "half-year") return key.replace("-H1", " 上半年").replace("-H2", " 下半年");
  if (granularity === "quarter") return key.replace("-Q", " 年第 ") + " 季度";
  if (granularity === "month") return key;
  if (granularity === "week") return key.replace("-W", " 第") + " 周";
  return key;
}

function compressPoints(points, endTs) {
  const now = endTs;
  const buckets = new Map();
  for (const point of points) {
    const ageDays = (now - new Date(point.at).getTime()) / 86400000;
    const granularity = granularityForAgeDays(ageDays);
    const key = bucketKey(point.at, granularity);
    const bucketId = `${granularity}|${key}`;
    if (!buckets.has(bucketId)) {
      buckets.set(bucketId, {
        period: bucketLabel(key, granularity),
        granularity,
        items: []
      });
    }
    const bucket = buckets.get(bucketId);
    if (bucket.items.length < (granularity === "day" || granularity === "week" ? 8 : granularity === "month" ? 4 : 2)) {
      bucket.items.push(point);
    }
  }
  return [...buckets.values()].sort((a, b) => {
    const ta = new Date(a.items[0]?.at || 0).getTime();
    const tb = new Date(b.items[0]?.at || 0).getTime();
    return ta - tb;
  });
}

function phaseForPoint(at, startTs, recentStartTs) {
  const ts = new Date(at).getTime();
  if (ts >= recentStartTs) return "recent";
  const historySpan = Math.max(1, recentStartTs - startTs);
  const ageRatio = (ts - startTs) / historySpan;
  if (ageRatio < 0.14) return "background";
  if (ageRatio < 0.28) return "outbreak";
  if (ageRatio < 0.52) return "core";
  if (ageRatio < 0.72) return "turning";
  return "progress";
}

function assignPhases(points, startTs, endTs, longConflict = false) {
  const scale = buildTimeAxisScale(startTs, endTs, { longConflict });
  const phases = PHASE_DEFS.map((def) => ({
    phase: def.key,
    label: def.label,
    from: null,
    to: null,
    granularity:
      def.key === "recent" ? "day" : def.key === "background" || def.key === "outbreak" ? "year" : "quarter",
    items: []
  }));

  for (const point of points) {
    const key = phaseForPoint(point.at, startTs, scale.recentStartTs);
    const target = phases.find((item) => item.phase === key);
    const cap = PHASE_CAPS[key] || 3;
    if (target.items.length < cap) target.items.push(point);
  }

  for (const phase of phases) {
    if (!phase.items.length) continue;
    const sorted = phase.items.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    phase.from = sorted[0].at;
    phase.to = sorted[sorted.length - 1].at;
  }

  return phases.filter((phase) => phase.items.length > 0);
}

function seedConflictMilestones(query, startTs, endTs) {
  const text = String(query || "");
  if (!/俄乌|乌克兰|俄罗斯|乌东|顿巴斯/.test(text)) return [];
  const seeds = [
    { at: "2014-02-20T00:00:00.000Z", title: "克里米亚与东乌局势", text: "2014 年起东乌克兰局势持续紧张，为后续大规模冲突埋下背景。" },
    { at: "2022-02-24T00:00:00.000Z", title: "全面军事行动开始", text: "2022 年 2 月 24 日俄方宣布在乌东开展特别军事行动，冲突全面升级。" },
    { at: "2022-09-01T00:00:00.000Z", title: "战场拉锯与制裁深化", text: "2022 年下半年起多线拉锯，欧美对俄制裁与能源博弈加剧。" },
    { at: "2023-06-01T00:00:00.000Z", title: "反攻与援助节奏", text: "乌方反攻与西方军援节奏成为影响战局与谈判窗口的关键变量。" },
    { at: "2024-01-01T00:00:00.000Z", title: "长期化与和谈试探", text: "冲突进入消耗阶段，和谈与领土议题反复，能源与粮食外溢影响持续。" },
    { at: "2025-01-15T00:00:00.000Z", title: "前线僵持与援助博弈", text: "2025 年战线变化有限，西方军援节奏与国内动员议题持续影响谈判窗口。" }
  ];
  return seeds
    .filter((item) => {
      const ts = new Date(item.at).getTime();
      return ts >= startTs && ts <= endTs;
    })
    .map((item) => ({
      ...item,
      eventId: "seed-milestone",
      eventTitle: text,
      level: "core",
      source: "seed",
      synthetic: true
    }));
}

/** @deprecated 使用 resolveAnalysisWindow */
export function resolveWindow(query, _yearsIgnored, endTs) {
  return resolveAnalysisWindow(query, endTs);
}

export { isLongConflictQuery } from "./analysis-window.mjs";

/** 脉络图主轨节点：种子 + 各阶段代表点，填补过长时间空白 */
export function selectChartMilestones(chronology, query = "") {
  const MS_DAY = 86400000;
  const points = Array.isArray(chronology?.points) ? chronology.points : [];
  const phases = Array.isArray(chronology?.phases) ? chronology.phases : [];
  const selected = [];
  const seen = new Set();

  const add = (point) => {
    if (!point?.at) return;
    const key = `${dayKey(point.at)}|${String(point.title || "").slice(0, 40)}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push({
      id: point.id || `ms-${selected.length}`,
      at: point.at,
      title: point.title || point.eventTitle || "节点",
      text: point.text || "",
      level: point.level || (point.source === "seed" ? "core" : "important"),
      eventId: point.eventId || "milestone",
      source: point.source || "milestone"
    });
  };

  for (const point of points.filter((item) => item.source === "seed")) add(point);
  for (const phase of phases) {
    const cap = phase.phase === "recent" ? 4 : phase.phase === "core" || phase.phase === "progress" ? 3 : 2;
    for (const item of (phase.items || []).slice(0, cap)) add(item);
  }

  const sorted = selected.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const maxGapMs = isLongConflictQuery(query) ? 14 * 30 * MS_DAY : 18 * 30 * MS_DAY;

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const t0 = new Date(sorted[i].at).getTime();
    const t1 = new Date(sorted[i + 1].at).getTime();
    if (t1 - t0 <= maxGapMs) continue;
    const mid = (t0 + t1) / 2;
    const bridge = points
      .slice()
      .sort(
        (a, b) =>
          Math.abs(new Date(a.at).getTime() - mid) - Math.abs(new Date(b.at).getTime() - mid)
      )
      .find((candidate) => {
        const ts = new Date(candidate.at).getTime();
        return ts > t0 + 7 * MS_DAY && ts < t1 - 7 * MS_DAY;
      });
    if (bridge) add(bridge);
  }

  if (isLongConflictQuery(query) && sorted.length >= 2) {
    const yearsPresent = new Set(sorted.map((item) => new Date(item.at).getUTCFullYear()));
    const startYear = new Date(sorted[0].at).getUTCFullYear();
    const endYear = new Date(sorted[sorted.length - 1].at).getUTCFullYear();
    for (let year = startYear; year <= endYear; year += 1) {
      if (yearsPresent.has(year)) continue;
      const bridge = points.find((item) => new Date(item.at).getUTCFullYear() === year);
      if (bridge) add(bridge);
    }
  }

  return selected
    .slice()
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function formatAxisCaption(iso, suffix = "") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return suffix || "";
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const base = day === "01" ? `${y}-${m}` : `${y}-${m}-${day}`;
  return suffix ? `${base} ${suffix}` : base;
}

function phaseItems(phases, key) {
  const phase = phases.find((item) => item.phase === key);
  return Array.isArray(phase?.items) ? phase.items : [];
}

/** 事件轴叙述：背景起点、爆发/起点、当前进展，而非固定回溯窗口日期 */
export function buildEventAxisNarrative(chronology, query = "") {
  const phases = chronology?.phases || [];
  const points = Array.isArray(chronology?.points) ? chronology.points : [];
  const sorted = points.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const backgroundItems = phaseItems(phases, "background");
  const outbreakItems = phaseItems(phases, "outbreak");
  const recentItems = phaseItems(phases, "recent");

  const backgroundItem = backgroundItems[0] || sorted.find((p) => p.source === "seed" && /背景|克里米亚|起因/.test(`${p.title} ${p.text}`));
  const outbreakItem = outbreakItems[0] || sorted.find((p) => /爆发|起点|军事行动|全面升级/.test(`${p.title} ${p.text}`));
  const latestItem = recentItems[recentItems.length - 1] || sorted[sorted.length - 1];

  const eventStartIso = backgroundItem?.at || outbreakItem?.at || sorted[0]?.at || chronology?.timeRange?.start;
  const eventEndIso = latestItem?.at || chronology?.timeRange?.end;
  const endTs = new Date(eventEndIso || Date.now()).getTime();
  const isRecent = Date.now() - endTs < 120 * 86400000;

  const backgroundText = backgroundItem?.text
    || backgroundItems.map((item) => item.text).filter(Boolean).join(" ")
    || "";

  const leftCaption = backgroundItem
    ? formatAxisCaption(backgroundItem.at, "背景")
    : outbreakItem
      ? formatAxisCaption(outbreakItem.at, "起点")
      : eventStartIso
        ? formatAxisCaption(eventStartIso, "起点")
        : "";

  const rightCaption = isRecent ? "至今" : eventEndIso ? formatAxisCaption(eventEndIso) : "至今";

  const outbreakCaption = outbreakItem ? formatAxisCaption(outbreakItem.at, "爆发") : "";

  const headlineParts = [String(query || "").trim() || "主事件"];
  if (backgroundItem) headlineParts.push(formatAxisCaption(backgroundItem.at, "背景"));
  if (outbreakCaption) headlineParts.push(outbreakCaption);
  headlineParts.push(`→ ${rightCaption}`);

  return {
    headline: headlineParts.filter(Boolean).join(" · "),
    background: backgroundText,
    leftCaption,
    rightCaption,
    outbreakCaption,
    eventStart: eventStartIso || null,
    eventEnd: eventEndIso || null,
    windowStart: chronology?.timeRange?.start || null,
    windowEnd: chronology?.timeRange?.end || null
  };
}

export function buildEventChronology(events, options = {}) {
  const endTs = options.endTs || Date.now();
  const query = String(options.query || "");
  const { startTs, longConflict } = resolveAnalysisWindow(query, endTs);

  const seeds = seedConflictMilestones(query, startTs, endTs);
  let points = collectRawPoints(events, startTs, endTs);
  if (seeds.length) {
    const seen = new Set(points.map((p) => `${p.at}|${p.title}`));
    for (const seed of seeds) {
      const key = `${seed.at}|${seed.title}`;
      if (!seen.has(key)) {
        points.push(seed);
        seen.add(key);
      }
    }
    points.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  }

  const effectiveStart = startTs;
  const effectiveEnd = points.length
    ? Math.max(endTs, new Date(points[points.length - 1].at).getTime())
    : endTs;

  const phases = assignPhases(points, effectiveStart, effectiveEnd, longConflict);
  const buckets = compressPoints(points, effectiveEnd);
  const timeAxis = buildTimeAxisScale(effectiveStart, effectiveEnd, { longConflict });
  const chartMilestones = selectChartMilestones({ points, phases }, query);
  const axisNarrative = buildEventAxisNarrative(
    { phases, points, timeRange: { start: toIso(effectiveStart), end: toIso(effectiveEnd) } },
    query
  );

  return {
    query,
    timeRange: {
      start: axisNarrative.eventStart || toIso(effectiveStart),
      end: axisNarrative.eventEnd || toIso(effectiveEnd)
    },
    axisNarrative,
    timeAxis: {
      mode: timeAxis.mode,
      historyWidth: timeAxis.historyWidth,
      recentWidth: timeAxis.recentWidth,
      recentStart: toIso(timeAxis.recentStartTs)
    },
    totalPoints: points.length,
    phases,
    buckets,
    chartMilestones,
    points: points.slice(-48)
  };
}
