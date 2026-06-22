export type ReportStatusKind = "not_fetched" | "source_failed" | "filtered_empty" | "ready";

export type ProviderStatus = {
  provider?: string;
  status?: string;
  count?: number;
  message?: string;
};

export type ReportStatus = {
  kind?: ReportStatusKind;
  message?: string;
  sourceAttempted?: boolean;
  sourceArticleCount?: number;
  ingestedEventCount?: number;
  providerStatuses?: ProviderStatus[];
};

const KIND_LABELS: Record<ReportStatusKind, string> = {
  not_fetched: "未拉源",
  source_failed: "来源失败",
  filtered_empty: "筛选为空",
  ready: "已生成"
};

export function reportStatusLabel(status?: ReportStatus | null) {
  const kind = status?.kind;
  if (!kind || !(kind in KIND_LABELS)) return "未确认";
  const count =
    kind === "ready"
      ? Number(status?.ingestedEventCount || 0)
      : Number(status?.sourceArticleCount || 0);
  if (kind === "ready" && count > 0) return `${KIND_LABELS[kind]} · ${count} 条`;
  if (kind === "filtered_empty" && count > 0) return `${KIND_LABELS[kind]} · ${count} 条资料`;
  return KIND_LABELS[kind];
}

export function reportStatusMessage(status?: ReportStatus | null) {
  if (status?.message) return status.message;
  const kind = status?.kind;
  if (kind === "source_failed") return "已尝试拉取来源，但当前 provider 未返回可用资料。";
  if (kind === "filtered_empty") return "已检索到资料，但未形成当日有效事件。";
  if (kind === "ready") return "报告已生成。";
  return "当前日期尚未执行外部来源刷新，仅按本地事件库生成。";
}

export function reportStatusTone(status?: ReportStatus | null): "default" | "accent" | "muted" {
  if (status?.kind === "ready") return "accent";
  if (status?.kind === "source_failed" || status?.kind === "filtered_empty") return "muted";
  return "default";
}
