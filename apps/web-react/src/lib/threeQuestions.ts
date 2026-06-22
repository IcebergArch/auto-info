/* 三问透镜派生层
 * 把日报真实数据归约到「发生了什么 / 影响是什么 / 能做什么」三个判断维度。
 * 原则：只从已有字段派生，不伪造数据；缺数据时降级为空态由 UI 处理。
 */

import type { DailyReportCardData } from "../components/DailyReportCard";
import { cleanDesc, dedupeSignals, scoreDensity } from "./signalDensity";

type AnyEvent = {
  id?: string;
  title?: string;
  displayTitle?: string;
  desc?: string;
  summary?: string;
  category?: string;
  region?: string;
  severity?: number;
  lane?: string;
  laneTitle?: string;
  time?: string;
  occurredAt?: string;
  at?: string;
  url?: string;
  isRefreshCutoff?: boolean;
  references?: Array<{ url?: string }>;
};

export type SignalItem = {
  id: string;
  title: string;
  desc: string;
  category: string;
  severity: number;
  url?: string;
  /** 信息密度评分 0-100（signalDensity.scoreDensity） */
  density: number;
  /** 被折叠的近似重复条数（0 表示无重复） */
  dupCount: number;
};

export type ImpactBand = {
  key: "high" | "watch" | "ambient";
  label: string;
  count: number;
  /** 该波段下最高冲击的若干条，供展开查看 */
  items: SignalItem[];
};

export type CategoryShare = {
  label: string;
  count: number;
};

export type ActionSuggestion = {
  key: string;
  label: string;
  hint: string;
  /** 该行动指向的页面（由 UI 决定如何跳转），或 external 打开来源 */
  target: "analysis" | "reading" | "techRadar" | "source" | "refresh";
  url?: string;
};

export type ThreeQuestionModel = {
  hasData: boolean;
  eventCount: number;
  /** 近似重复被折叠的条数（用于提示"已合并 N 条重复"） */
  foldedCount: number;
  /** 发生了什么 */
  headline: string;
  topSignals: SignalItem[];
  /** 影响是什么 */
  impactBands: ImpactBand[];
  highImpactCount: number;
  categoryShares: CategoryShare[];
  regions: string[];
  /** 能做什么 */
  actions: ActionSuggestion[];
};

const SEVERITY_HIGH = 80;
const SEVERITY_WATCH = 55;

function pickTitle(ev: AnyEvent): string {
  return String(ev.displayTitle || ev.title || "").trim();
}

function pickDesc(ev: AnyEvent): string {
  const raw = String(ev.desc || ev.summary || "").trim();
  if (!raw || /建议点击 ↗ 查看英文原文/.test(raw) || /出现值得跟踪的重要信息/.test(raw)) {
    return "";
  }
  return raw;
}

function pickUrl(ev: AnyEvent): string | undefined {
  const fromRefs = (ev.references || []).find((r) => r.url)?.url;
  if (fromRefs) return fromRefs;
  if (ev.url) return ev.url;
  const t = String(ev.title || "").trim();
  if (/^https?:\/\//i.test(t)) return t;
  return undefined;
}

function pickCategory(ev: AnyEvent): string {
  return String(ev.category || ev.laneTitle || ev.lane || "其他").trim() || "其他";
}

/** 从 report 收集去重后的真实事件列表（合并 timeline 与 focusSections） */
function collectEvents(report: DailyReportCardData | null): AnyEvent[] {
  if (!report) return [];
  const out: AnyEvent[] = [];
  const seen = new Set<string>();
  const push = (ev: AnyEvent) => {
    if (!ev || ev.isRefreshCutoff) return;
    const title = pickTitle(ev);
    if (!title) return;
    const key = ev.id || title;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ev);
  };

  (report.timeline || []).forEach(push);

  const sections = report.focusSections || {};
  (Object.keys(sections) as Array<keyof typeof sections>).forEach((k) => {
    const block = sections[k];
    (block?.events || []).forEach((ev) =>
      push({ ...(ev as AnyEvent), lane: String(k), laneTitle: (ev as AnyEvent).category })
    );
  });

  // events[] 兜底
  (report.events || []).forEach((ev) => push(ev as AnyEvent));

  return out;
}

function toSignal(ev: AnyEvent): SignalItem {
  const title = pickTitle(ev);
  // 去标题回声 + 去套话：cleanDesc 在原始 desc 基础上提炼增量
  const desc = cleanDesc(title, pickDesc(ev));
  return {
    id: String(ev.id || title),
    title,
    desc,
    category: pickCategory(ev),
    severity: typeof ev.severity === "number" ? ev.severity : 0,
    url: pickUrl(ev),
    density: scoreDensity(title, desc),
    dupCount: 0
  };
}

export function buildThreeQuestionModel(
  report: DailyReportCardData | null,
  viewDate: string
): ThreeQuestionModel {
  const events = collectEvents(report);
  const rawSignals = events.map(toSignal);

  // 近似重复折叠：同事件不同措辞聚为一条，代表保留冲击最高者并记录折叠数
  const signals = dedupeSignals(rawSignals).map(({ kept, dupCount }) => ({
    ...kept,
    dupCount
  }));
  const eventCount = signals.length;
  const rawCount = rawSignals.length;
  const foldedCount = rawCount - eventCount;

  // 排序：冲击优先，同冲击下密度高者优先（让高信息量信号上浮）
  const bySeverity = [...signals].sort(
    (a, b) => b.severity - a.severity || b.density - a.density
  );

  const high = bySeverity.filter((s) => s.severity >= SEVERITY_HIGH);
  const watch = bySeverity.filter((s) => s.severity >= SEVERITY_WATCH && s.severity < SEVERITY_HIGH);
  const ambient = bySeverity.filter((s) => s.severity < SEVERITY_WATCH);

  const impactBands: ImpactBand[] = [
    { key: "high", label: "高冲击", count: high.length, items: high.slice(0, 6) },
    { key: "watch", label: "需关注", count: watch.length, items: watch.slice(0, 6) },
    { key: "ambient", label: "环境信息", count: ambient.length, items: ambient.slice(0, 4) }
  ];

  // 类别分布
  const catMap = new Map<string, number>();
  signals.forEach((s) => catMap.set(s.category, (catMap.get(s.category) || 0) + 1));
  const categoryShares: CategoryShare[] = [...catMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const regions = [
    ...new Set(events.map((e) => String(e.region || "").trim()).filter(Boolean))
  ].slice(0, 8);

  // top 信号：优先高冲击，否则取前几条
  const topSignals = (high.length ? high : bySeverity).slice(0, 5);

  const foldNote = foldedCount > 0 ? `（已合并 ${foldedCount} 条重复）` : "";
  const headline = !eventCount
    ? `${viewDate} 暂无匹配事件`
    : high.length
      ? `${viewDate} · ${eventCount} 条信号${foldNote}，${high.length} 条高冲击需优先研判`
      : `${viewDate} · ${eventCount} 条信号${foldNote}，暂无高冲击，可常规浏览`;

  // 能做什么：基于真实信号派生可执行项
  const actions: ActionSuggestion[] = [];
  if (high.length) {
    actions.push({
      key: "analyze-high",
      label: `研判 ${high.length} 条高冲击`,
      hint: "进入分析页查看事件关系与影响链",
      target: "analysis"
    });
  }
  const topWithSource = topSignals.find((s) => s.url);
  if (topWithSource?.url) {
    actions.push({
      key: "open-source",
      label: "打开首要信号来源",
      hint: topWithSource.title.slice(0, 28),
      target: "source",
      url: topWithSource.url
    });
  }
  actions.push({
    key: "deep-read",
    label: "深读与摘要",
    hint: "把关注信号送入阅读助手提炼要点",
    target: "reading"
  });
  if ((report?.timeline || []).length || categoryShares.some((c) => /科技/.test(c.label))) {
    actions.push({
      key: "tech-radar",
      label: "查看科技雷达",
      hint: "追踪技术趋势的长周期演化",
      target: "techRadar"
    });
  }

  return {
    hasData: eventCount > 0,
    eventCount,
    foldedCount,
    headline,
    topSignals,
    impactBands,
    highImpactCount: high.length,
    categoryShares,
    regions,
    actions
  };
}
