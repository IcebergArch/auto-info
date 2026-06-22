export type TechRadarEntry = {
  id: string;
  term: string;
  title: string;
  brief: string;
  status: "open" | "settled" | "archived";
  granularity: "day" | "week" | "month";
  occurredAt: string;
  /** 展示用周期起止（月 01—末；周 周一—周日） */
  periodStart?: string;
  periodEnd?: string;
  tags?: string[];
  briefingSessionId?: string | null;
  detailBlocks?: Array<{ label: string; body: string; sourceUrl?: string; sourceTitle?: string }>;
  relatedReportDates?: string[];
  sources?: Array<{ title: string; url: string; provider?: string }>;
};

export type TechRadarTimelineNode = {
  kind: "year" | "month" | "entry";
  id: string;
  label?: string;
  periodStart?: string;
  periodEnd?: string;
  periodLabel?: string;
  defaultExpanded?: boolean;
  children?: TechRadarTimelineNode[];
  entry?: TechRadarEntry;
};

export type TechRadarTodayWindow = {
  date: string;
  startAt: string;
  endAt: string;
  entryCount: number;
};

/** 与 UC-001 时间线一致的「上次更新」锚点（见 shared/timeline-refresh.mjs） */
export type TechRadarRefreshCutoff = {
  id: string;
  at: string;
  time?: string;
  isRefreshCutoff: true;
  title: string;
  displayTitle?: string;
  desc: string;
  lane?: string;
  laneTitle?: string;
};
