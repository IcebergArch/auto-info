import { promises as fs } from "node:fs";
import path from "node:path";
import { normalizeEvent } from "./event-model.mjs";
import { nowIso } from "./utils.mjs";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const STORE_FILE = path.join(DATA_DIR, "auto-info-store.json");
const SEED_FILE = path.join(DATA_DIR, "seed-events.json");
const READING_FILE = path.join(DATA_DIR, "reading-history.json");
const ANALYSIS_FILE = path.join(DATA_DIR, "analysis-history.json");
const REPORT_FILE = path.join(DATA_DIR, "auto-info-reports.json");
const DEFAULT_FOCUS_CATEGORIES = ["国际局势", "中国政策", "AI", "音视频"];

/** 仅串行化写入；读操作不入队，避免首页刷新把 GET /reports 堵在归档写后面 */
let reportStoreWriteChain = Promise.resolve();

async function atomicWriteJson(filePath, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, body, "utf-8");
  await fs.rename(tmpPath, filePath);
}

function withReportStoreWriteLock(task) {
  const run = reportStoreWriteChain.then(() => task());
  reportStoreWriteChain = run.catch(() => {});
  return run;
}

async function loadReportStoreFromDisk() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!(await fileExists(REPORT_FILE))) {
    return { version: 1, reports: [] };
  }

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await fs.readFile(REPORT_FILE, "utf-8");
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.reports)) parsed.reports = [];
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        continue;
      }
    }
  }

  const backup = `${REPORT_FILE}.corrupt-${Date.now()}.bak`;
  try {
    await fs.rename(REPORT_FILE, backup);
  } catch {
    // ignore backup failure
  }
  const empty = { version: 1, reports: [], recoveredFrom: lastError?.message || "parse failed" };
  await atomicWriteJson(REPORT_FILE, empty);
  return empty;
}

/** 写入路径：读-改-写同一写锁内完成 */
export async function mutateReportStore(mutator) {
  return withReportStoreWriteLock(async () => {
    const store = await loadReportStoreFromDisk();
    const next = await mutator(store);
    const toWrite = next || store;
    toWrite.updatedAt = nowIso();
    await atomicWriteJson(REPORT_FILE, toWrite);
    return toWrite;
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureEventStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (await fileExists(STORE_FILE)) return;

  let seeds = [];
  try {
    const seedRaw = await fs.readFile(SEED_FILE, "utf-8");
    seeds = JSON.parse(seedRaw);
  } catch {
    seeds = [];
  }

  const store = {
    version: 1,
    generatedAt: nowIso(),
    events: seeds.map((event, index) => normalizeEvent(event, index)),
    queryHistory: [],
    focusCategories: [...DEFAULT_FOCUS_CATEGORIES]
  };
  await fs.writeFile(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

export async function readEventStore() {
  await ensureEventStore();
  const raw = await fs.readFile(STORE_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.events)) parsed.events = [];
  if (!Array.isArray(parsed.queryHistory)) parsed.queryHistory = [];
  if (!Array.isArray(parsed.focusCategories) || !parsed.focusCategories.length) {
    parsed.focusCategories = [...DEFAULT_FOCUS_CATEGORIES];
  }
  return parsed;
}

export async function writeEventStore(store) {
  store.generatedAt = nowIso();
  await fs.writeFile(STORE_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

export async function readReadingStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!(await fileExists(READING_FILE))) {
    const empty = { version: 1, sessions: [] };
    await fs.writeFile(READING_FILE, `${JSON.stringify(empty, null, 2)}\n`, "utf-8");
    return empty;
  }
  const raw = await fs.readFile(READING_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
  return parsed;
}

export async function writeReadingStore(store) {
  store.updatedAt = nowIso();
  await fs.writeFile(READING_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

export async function readAnalysisStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!(await fileExists(ANALYSIS_FILE))) {
    const empty = { version: 1, sessions: [] };
    await fs.writeFile(ANALYSIS_FILE, `${JSON.stringify(empty, null, 2)}\n`, "utf-8");
    return empty;
  }
  const raw = await fs.readFile(ANALYSIS_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.sessions)) parsed.sessions = [];
  return parsed;
}

export async function writeAnalysisStore(store) {
  store.updatedAt = nowIso();
  await fs.writeFile(ANALYSIS_FILE, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

export async function readReportStore() {
  return loadReportStoreFromDisk();
}

export async function writeReportStore(store) {
  return mutateReportStore(async () => store);
}

export { DATA_DIR, STORE_FILE, READING_FILE, ANALYSIS_FILE, REPORT_FILE };
