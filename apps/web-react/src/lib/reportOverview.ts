const CROSS_DAY_COLLECTION_RE = /（含 \d{4}-\d{2}-\d{2} 至 \d{4}-\d{2}-\d{2} 收录）/g;

/** 剔除跨日收录说明，并校正事件条数前缀 */
export function normalizeOverviewSummary(summary: string, date: string, eventCount: number) {
  let text = String(summary || "")
    .replace(CROSS_DAY_COLLECTION_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!eventCount) {
    return `${date} 暂无匹配事件，日报保留空状态并等待新增来源。`;
  }
  const head = `${date} · ${eventCount} 条事件`;
  const tail = text
    .replace(/^\d{4}-\d{2}-\d{2}\s*·\s*\d+\s*条事件[^。]*。?\s*/, "")
    .trim();
  if (!tail) return `${head}。`;
  if (tail.startsWith(head)) return tail;
  return `${head}。${tail}`;
}
