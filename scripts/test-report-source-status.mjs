#!/usr/bin/env node
/** UC-001/UC-006 source status semantics */

import {
  deriveSourceStatus,
  emptySourceStatus,
  summarizeSourceSearches
} from "../services/api/src/shared/source-status.mjs";
import {
  getDailyReport,
  updateDailyReport
} from "../services/api/src/use-cases/uc-001-daily-events/service.mjs";
import { listTechRadarFeed } from "../services/api/src/use-cases/uc-006-tech-radar/service.mjs";
import { todayProductKey } from "../services/api/src/shared/utils.mjs";

function assert(condition, message, detail = undefined) {
  if (condition) return;
  console.error(`[test:report-source-status] fail: ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

function statusFixture() {
  const noRefresh = emptySourceStatus({ eventCount: 0 });
  assert(noRefresh.kind === "not_fetched", "empty local report should be not_fetched", noRefresh);
  assert(noRefresh.sourceAttempted === false, "empty local report should not claim source attempted", noRefresh);

  const failed = deriveSourceStatus({
    eventCount: 0,
    sourceSearches: [
      {
        articleCount: 0,
        providerStatuses: [
          { provider: "googleNews", status: "error", count: 0, message: "fetch failed" },
          { provider: "gdelt", status: "error", count: 0, message: "timeout" }
        ]
      }
    ]
  });
  assert(failed.kind === "source_failed", "failed providers should be source_failed", failed);
  assert(failed.sourceAttempted === true, "failed providers should still mark source attempted", failed);

  const filtered = deriveSourceStatus({
    eventCount: 0,
    sourceSearches: [
      {
        articleCount: 3,
        providerStatuses: [{ provider: "googleNews", status: "ok", count: 3 }]
      }
    ]
  });
  assert(filtered.kind === "filtered_empty", "articles without events should be filtered_empty", filtered);
  assert(filtered.sourceArticleCount === 3, "filtered status should count source articles", filtered);

  const ready = deriveSourceStatus({
    eventCount: 2,
    sourceSearches: [
      {
        articleCount: 3,
        providerStatuses: [{ provider: "googleNews", status: "ok", count: 3 }]
      }
    ]
  });
  assert(ready.kind === "ready", "events should produce ready status", ready);
  assert(ready.ingestedEventCount === 2, "ready status should count ingested events", ready);

  const summarized = summarizeSourceSearches([
    { articleCount: 1, providerStatuses: [{ provider: "gdelt", status: "error", count: 0 }] },
    { articleCount: 2, providerStatuses: [{ provider: "googleNews", status: "ok", count: 2 }] }
  ]);
  assert(summarized.articleCount === 3, "summary should total articles", summarized);
  assert(summarized.providerStatuses.length === 2, "summary should flatten provider statuses", summarized);
}

async function reportFixture() {
  const today = todayProductKey();
  const report = await getDailyReport(new URLSearchParams({ date: today }));
  assert(report.status?.kind, "GET /report should expose report.status", report.status);
  assert(
    ["not_fetched", "ready"].includes(report.status.kind),
    "read-only local report should be not_fetched or ready",
    report.status
  );

  const rebuilt = await updateDailyReport({ date: today, pullSources: false });
  assert(rebuilt.status?.kind, "POST /report/update should expose top-level status", rebuilt.status);
  assert(rebuilt.report?.status?.kind, "POST /report/update should attach status to report", rebuilt.report?.status);
  assert(rebuilt.status.kind !== "source_failed", "local rebuild should not claim source failure", rebuilt.status);
}

async function techRadarFixture() {
  const feed = await listTechRadarFeed(new URLSearchParams());
  assert(feed.todayWindow?.status?.kind, "tech radar todayWindow should expose status", feed.todayWindow?.status);
  assert(
    ["not_fetched", "ready"].includes(feed.todayWindow.status.kind),
    "read-only tech radar feed should be not_fetched or ready",
    feed.todayWindow.status
  );
}

async function main() {
  statusFixture();
  await reportFixture();
  await techRadarFixture();
  console.log("[test:report-source-status] ok");
}

main().catch((error) => {
  console.error("[test:report-source-status] error:", error);
  process.exit(1);
});
