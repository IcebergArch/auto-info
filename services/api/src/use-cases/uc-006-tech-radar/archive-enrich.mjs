import { presentEventForReport } from "../uc-001-daily-events/event-display.mjs";
import { readReportStore } from "../../shared/store.mjs";
import { focusTechEventsForRadar } from "./big-tech-focus.mjs";

export const PLACEHOLDER_ARCHIVE_RE =
  /该月条目由回溯任务生成|系统回溯补齐|可结合当月日报「科技」分栏与阅读助手简报进一步充实/;

const BLOCK_THEMES = [
  {
    label: "平台",
    re: /google|openai|anthropic|claude|gemini|xai|meta|llama|microsoft|copilot|nvidia|aws|bedrock|blog\.|arxiv/i
  },
  { label: "工程", re: /harness|mcp|agent|编排|工程|github|cursor|自动化|工具链/i },
  { label: "LLM", re: /llm|gpt|大模型|推理|上下文|openai|anthropic|算力|芯片/i },
  { label: "影视", re: /视频|影视|video|film|生成模型|sora|runway|一致性|时长/i },
  { label: "产品", re: /产品|订阅|助手|商用|试点|现象级|工作流/i }
];

function eventSourceUrl(event) {
  const ref = (event.references || []).find((r) => r?.url);
  return ref?.url ? String(ref.url).trim() : "";
}

function lastDayOfMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function reportsForMonth(reportStore, monthKey) {
  return (reportStore.reports || []).filter((row) => {
    const date = row.date || row.report?.date;
    return date && String(date).startsWith(monthKey);
  });
}

function techEventsFromReports(monthRows) {
  const seen = new Set();
  const events = [];
  for (const row of monthRows) {
    const report = row.report || row;
    const list = report.focusSections?.technology?.events || [];
    for (const raw of list) {
      const event = presentEventForReport(raw);
      const key = event.id || `${event.title}|${event.occurredAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = eventSourceUrl(event);
      events.push({
        id: event.id,
        title: event.displayTitle || event.title,
        summary: String(event.desc || event.summary || "").trim(),
        severity: Number(event.severity || 0),
        occurredAt: event.occurredAt,
        url,
        references: event.references || []
      });
    }
  }
  return focusTechEventsForRadar(
    events.sort((a, b) => b.severity - a.severity || new Date(b.occurredAt) - new Date(a.occurredAt))
  );
}

function pickForTheme(events, re, { requireUrl = false } = {}) {
  const matched = events.filter((event) => re.test(`${event.title} ${event.summary}`));
  if (!matched.length) return undefined;
  if (requireUrl) return matched.find((event) => event.url) || matched[0];
  return matched[0];
}

function buildDetailBlocksFromEvents(events, fallbackSummary) {
  const blocks = [];
  const used = new Set();

  for (const theme of BLOCK_THEMES) {
    const match = pickForTheme(events, theme.re, { requireUrl: true });
    if (!match || used.has(match.id)) continue;
    used.add(match.id);
    const body = match.summary
      ? `${match.title}：${match.summary}`
      : match.title;
    blocks.push({
      label: theme.label,
      body,
      sourceUrl: match.url || undefined,
      sourceTitle: match.references?.[0]?.title || match.title
    });
  }

  if (!blocks.length && events.length) {
    for (const event of events.slice(0, 4)) {
      blocks.push({
        label: event.title.slice(0, 12),
        body: event.summary ? `${event.title}：${event.summary}` : event.title,
        sourceUrl: event.url || undefined,
        sourceTitle: event.references?.[0]?.title || event.title
      });
    }
  }

  if (!blocks.length && fallbackSummary) {
    blocks.push({
      label: "科技",
      body: fallbackSummary
    });
  }

  return blocks;
}

function buildSourcesFromEvents(events, limit = 12) {
  const seen = new Set();
  const sources = [];
  for (const event of events) {
    const url = event.url;
    if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    sources.push({
      title: event.references?.[0]?.title || event.title,
      url,
      provider: event.references?.[0]?.provider || "daily-report"
    });
    if (sources.length >= limit) break;
  }
  return sources;
}

function summarizeMonth(events, monthRows) {
  const summaries = monthRows
    .map((row) => row.report?.focusSections?.technology?.summary)
    .filter(Boolean);
  if (summaries.length) {
    const uniq = [...new Set(summaries)].slice(0, 2);
    return uniq.join(" ");
  }
  if (events.length) {
    return `本月科技向共收录 ${events.length} 条可溯源事件，详见下方分主题要点与外链。`;
  }
  return "";
}

export function isPlaceholderArchiveEntry(entry) {
  if (entry.granularity !== "month") return false;
  const text = `${entry.brief || ""} ${(entry.detailBlocks || []).map((b) => b.body).join(" ")}`;
  return PLACEHOLDER_ARCHIVE_RE.test(text);
}

export function needsSourceRefresh(entry) {
  const sources = entry.sources || [];
  if (!sources.length) return true;
  return sources.every((s) => /example\.com/i.test(String(s.url || "")));
}

export function detailBlocksNeedSourceLinks(entry) {
  const blocks = entry.detailBlocks || [];
  if (!blocks.length) return false;
  return blocks.some((b) => !b.sourceUrl || /example\.com/i.test(String(b.sourceUrl || "")));
}

export async function enrichMonthArchiveEntry(entry, reportStore = null) {
  const monthKey = entry.id?.replace(/^tech-month-/, "") || entry.term?.slice(0, 7);
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return entry;

  const store = reportStore || (await readReportStore());
  const monthRows = reportsForMonth(store, monthKey);
  const events = techEventsFromReports(monthRows);
  const fallbackSummary = summarizeMonth(events, monthRows);

  if (!events.length && !fallbackSummary) {
    const rewriteMeta = isPlaceholderArchiveEntry(entry) || PLACEHOLDER_ARCHIVE_RE.test(`${entry.title} ${entry.brief}`);
    return {
      ...entry,
      title: rewriteMeta ? `${monthKey.slice(0, 4)}年${monthKey.slice(5, 7)}月科技月报` : entry.title,
      brief: rewriteMeta
        ? `请先在首页回溯 ${monthKey} 月日报，再点击「充实往期月报」写入科技栏来源。`
        : entry.brief,
      detailBlocks: [
        {
          label: "说明",
          body: `未找到 ${monthKey} 月已归档日报中的「科技」条目。请先在首页执行「${monthKey}」月份或「2025-12 至今」日报回溯，再点击「充实往期月报」。`
        }
      ],
      relatedReportDates: [],
      sources: entry.sources || [],
      tags: [...new Set([...(entry.tags || []), "待充实"])].filter((t) => t !== "自动补齐")
    };
  }

  let detailBlocks;
  if (
    entry.detailBlocks?.length &&
    !isPlaceholderArchiveEntry(entry) &&
    (needsSourceRefresh(entry) || entry.detailBlocks.some((b) => !b.sourceUrl))
  ) {
    detailBlocks = attachLinksToExistingBlocks(entry.detailBlocks, events);
  } else {
    detailBlocks = buildDetailBlocksFromEvents(events, fallbackSummary);
  }
  const sources = buildSourcesFromEvents(events);
  const relatedReportDates = [...new Set(monthRows.map((r) => r.date || r.report?.date).filter(Boolean))].slice(
    0,
    8
  );

  const topTitles = events.slice(0, 3).map((e) => e.title);
  const title =
    topTitles.length >= 2
      ? topTitles.slice(0, 2).join("、") + (events.length > 2 ? "等" : "")
      : entry.title;
  const brief =
    fallbackSummary ||
    (events[0]
      ? `${events[0].title}${events[0].summary ? `：${events[0].summary}` : ""}`
      : relatedReportDates.length
        ? `本月科技向要点来自已归档日报（${relatedReportDates.slice(0, 3).join("、")} 等），展开查看分主题摘要与外链。`
        : `请先在首页回溯 ${monthKey} 月日报，再点击「充实往期月报」写入科技栏来源。`);

  const rewriteMeta = isPlaceholderArchiveEntry(entry) || PLACEHOLDER_ARCHIVE_RE.test(`${entry.title} ${entry.brief}`);

  return {
    ...entry,
    title: rewriteMeta ? title : entry.title,
    brief: rewriteMeta ? brief : entry.brief,
    detailBlocks,
    sources: sources.length ? sources : entry.sources,
    relatedReportDates,
    tags: [...new Set([...(entry.tags || []), "日报充实"])].filter((t) => t !== "自动补齐")
  };
}

function attachLinksToExistingBlocks(blocks, events) {
  const pool = buildSourcesFromEvents(events);
  let poolIdx = 0;
  return blocks.map((block) => {
    if (block.sourceUrl && !/example\.com/i.test(block.sourceUrl)) return block;
    const theme = BLOCK_THEMES.find((t) => t.label === block.label);
    const match = theme
      ? pickForTheme(events, theme.re, { requireUrl: true })
      : events.find(
          (e) =>
            e.url &&
            block.body &&
            (String(block.body).includes(e.title.slice(0, 6)) || String(block.body).includes(e.title))
        );
    if (match?.url) {
      return {
        ...block,
        sourceUrl: match.url,
        sourceTitle: match.references?.[0]?.title || match.title
      };
    }
    const fallback = pool[poolIdx++];
    if (!fallback) return block;
    return {
      ...block,
      sourceUrl: fallback.url,
      sourceTitle: fallback.title
    };
  });
}

export async function enrichEntriesList(entries, { force = false } = {}) {
  const reportStore = await readReportStore();
  let repaired = 0;
  const out = [];

  for (const raw of entries) {
    let entry = { ...raw };
    const shouldEnrich =
      entry.granularity === "month" &&
      (force ||
        isPlaceholderArchiveEntry(entry) ||
        needsSourceRefresh(entry) ||
        detailBlocksNeedSourceLinks(entry) ||
        PLACEHOLDER_ARCHIVE_RE.test(`${entry.title} ${entry.brief}`));

    if (shouldEnrich) {
      entry = await enrichMonthArchiveEntry(entry, reportStore);
      repaired += 1;
    }

    if (entry.granularity === "day") {
      entry = enrichDayEntryLinks(entry);
    }

    out.push(entry);
  }

  return { entries: out, repaired, reportStore };
}

function enrichDayEntryLinks(entry) {
  const sources = (entry.sources || []).filter((s) => s.url && /^https?:\/\//i.test(s.url));
  const detailBlocks = (entry.detailBlocks || []).map((block) => {
    if (block.sourceUrl) return block;
    const match = sources.find((s) => block.body && String(block.body).includes(String(s.title).slice(0, 8)));
    if (match) {
      return { ...block, sourceUrl: match.url, sourceTitle: match.title };
    }
    return block;
  });

  if (entry.granularity === "month" || detailBlocks.length) {
    return { ...entry, detailBlocks: detailBlocks.length ? detailBlocks : entry.detailBlocks, sources };
  }

  if (!detailBlocks.length && sources.length && !entry.briefingSessionId) {
    return {
      ...entry,
      detailBlocks: sources.slice(0, 3).map((s, index) => ({
        label: index === 0 ? "来源" : `来源 ${index + 1}`,
        body: entry.brief || entry.title,
        sourceUrl: s.url,
        sourceTitle: s.title
      }))
    };
  }

  return { ...entry, sources };
}
