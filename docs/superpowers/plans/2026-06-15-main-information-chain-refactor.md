# Main Information Chain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the daily information chain explainable and usable: homepage refresh pulls sources by default, reports expose source/status semantics, and tech radar aligns with the same empty-state model.

**Architecture:** Add a small shared source-status model in `services/api/src/shared/source-status.mjs`, derive report status from `sourceSearches` and event counts, attach it to UC-001 reports and UC-006 today windows, then render it in React via a small `reportStatus` helper. Keep `GET /report` read-only and avoid async task center or storage migration.

**Tech Stack:** Node ESM backend, React + TypeScript frontend, existing script-based tests.

---

### Task 1: Add Source Status Model

**Files:**
- Create: `services/api/src/shared/source-status.mjs`
- Test: `scripts/test-report-source-status.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the status model test**

Create `scripts/test-report-source-status.mjs` with assertions for:

```js
import {
  deriveSourceStatus,
  emptySourceStatus,
  summarizeSourceSearches
} from "../services/api/src/shared/source-status.mjs";

const noRefresh = emptySourceStatus({ eventCount: 0 });
if (noRefresh.kind !== "not_fetched" || noRefresh.sourceAttempted !== false) process.exit(1);

const failed = deriveSourceStatus({
  eventCount: 0,
  sourceSearches: [{ articleCount: 0, providerStatuses: [{ provider: "googleNews", status: "error", message: "fetch failed" }] }]
});
if (failed.kind !== "source_failed" || failed.sourceAttempted !== true) process.exit(1);

const filtered = deriveSourceStatus({
  eventCount: 0,
  sourceSearches: [{ articleCount: 3, providerStatuses: [{ provider: "googleNews", status: "ok", count: 3 }] }]
});
if (filtered.kind !== "filtered_empty" || filtered.sourceArticleCount !== 3) process.exit(1);

const ready = deriveSourceStatus({
  eventCount: 2,
  sourceSearches: [{ articleCount: 3, providerStatuses: [{ provider: "googleNews", status: "ok", count: 3 }] }]
});
if (ready.kind !== "ready" || ready.ingestedEventCount !== 2) process.exit(1);

const summarized = summarizeSourceSearches([{ articleCount: 1, providerStatuses: [{ provider: "gdelt", status: "error" }] }]);
if (summarized.articleCount !== 1 || summarized.providerStatuses.length !== 1) process.exit(1);
```

- [ ] **Step 2: Run it and verify it fails**

Run: `node scripts/test-report-source-status.mjs`

Expected: FAIL because `source-status.mjs` does not exist.

- [ ] **Step 3: Implement `source-status.mjs`**

Export:

```js
export function summarizeSourceSearches(sourceSearches = []) { ... }
export function emptySourceStatus({ eventCount = 0 } = {}) { ... }
export function deriveSourceStatus({ eventCount = 0, sourceSearches = [] } = {}) { ... }
```

Rules:
- no attempted searches -> `not_fetched` unless `eventCount > 0`, then `ready`
- attempted, all providers failed/skipped/missing/free with zero articles -> `source_failed`
- attempted, articles > 0, events = 0 -> `filtered_empty`
- events > 0 -> `ready`

- [ ] **Step 4: Add test script to `test:unit`**

Add `node scripts/test-report-source-status.mjs` to the unit test chain.

### Task 2: Attach Status To UC-001 Reports

**Files:**
- Modify: `services/api/src/use-cases/uc-001-daily-events/service.mjs`
- Test: `scripts/test-report-source-status.mjs`

- [ ] **Step 1: Extend test for `getDailyReport` and `updateDailyReport`**

Add checks:

```js
const report = await getDailyReport(new URLSearchParams({ date: todayProductKey() }));
if (!report.status || !["not_fetched", "ready"].includes(report.status.kind)) process.exit(1);

const rebuilt = await updateDailyReport({ date: todayProductKey(), pullSources: false });
if (!rebuilt.status || rebuilt.status.kind === "source_failed") process.exit(1);
if (!rebuilt.report?.status) process.exit(1);
```

- [ ] **Step 2: Update report build/finalize path**

Import `emptySourceStatus` and ensure reports built through `GET /report` include conservative status:

```js
status: emptySourceStatus({ eventCount: events.length })
```

- [ ] **Step 3: Update `updateDailyReport`**

After pulling sources and building report:

```js
const status = deriveSourceStatus({ eventCount: report.events.length, sourceSearches });
report.status = status;
const archive = await archiveDailyReport(report, ...);
return { ..., status, sourceSearches, report, archive };
```

For `pullSources:false`, return `not_fetched` for empty reports or `ready` for non-empty local rebuilds.

### Task 3: Update Homepage Refresh And Status UI

**Files:**
- Create: `apps/web-react/src/lib/reportStatus.ts`
- Modify: `apps/web-react/src/components/DailyReportCard.tsx`
- Modify: `apps/web-react/src/components/DailyReportTimeline.tsx`
- Modify: `apps/web-react/src/pages/HomePage.tsx`

- [ ] **Step 1: Add frontend status type/helper**

Create `reportStatus.ts` with:

```ts
export type ReportStatusKind = "not_fetched" | "source_failed" | "filtered_empty" | "ready";
export type ReportStatus = { kind?: ReportStatusKind; message?: string; sourceAttempted?: boolean; sourceArticleCount?: number; ingestedEventCount?: number; providerStatuses?: Array<{ provider?: string; status?: string; count?: number; message?: string }> };
export function reportStatusLabel(status?: ReportStatus | null): string { ... }
export function reportStatusTone(status?: ReportStatus | null): "muted" | "warn" | "ok" { ... }
```

- [ ] **Step 2: Change homepage manual refresh**

In `refreshToday`, remove `pullSources:false`; send `{ date: todayKey() }`.

- [ ] **Step 3: Add status to hero and report card**

Show status label in `WorkspaceHero` stats and `DailyReportCard` meta.

- [ ] **Step 4: Add status section to timeline empty states**

In `DailyReportTimeline`, when no display entries, use `report.status.message`/helper label instead of generic “当前筛选下暂无当日事件”.

### Task 4: Align Tech Radar Status

**Files:**
- Modify: `services/api/src/use-cases/uc-006-tech-radar/service.mjs`
- Modify: `apps/web-react/src/pages/TechRadarPage.tsx`

- [ ] **Step 1: Backend todayWindow status**

Use `emptySourceStatus({ eventCount: todayEntryCount })` for current feed because `/feed` is read-only.

- [ ] **Step 2: Frontend status display**

Add `todayWindow.status` to feed type and show a compact status chip in the hero stats.

### Task 5: Verification

**Files:**
- Modify tests only as needed.

- [ ] **Step 1: Run focused status test**

Run: `node scripts/test-report-source-status.mjs`

Expected: PASS.

- [ ] **Step 2: Run related unit tests**

Run: `node scripts/test-report-timeline.mjs && node scripts/test-tech-radar.mjs`

Expected: PASS.

- [ ] **Step 3: Run audit and verify**

Run: `npm run audit && npm run verify`

Expected: PASS.

- [ ] **Step 4: UI smoke**

With `npm run start:dev`, open `http://127.0.0.1:5174/` and verify:
- Homepage loads.
- Refresh action is present.
- Empty daily report shows status reason.
- Tech radar loads and shows status.
