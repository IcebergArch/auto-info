import { promises as fs } from "node:fs";
import path from "node:path";
import { nowIso } from "../../shared/utils.mjs";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const RADAR_FILE = path.join(DATA_DIR, "auto-info-tech-radar.json");

let writeChain = Promise.resolve();

async function atomicWriteJson(filePath, data) {
  const body = `${JSON.stringify(data, null, 2)}\n`;
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmpPath, body, "utf-8");
  await fs.rename(tmpPath, filePath);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTechRadarStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (!(await fileExists(RADAR_FILE))) {
    return { version: 1, updatedAt: nowIso(), entries: [] };
  }
  const raw = await fs.readFile(RADAR_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.entries)) parsed.entries = [];
  return parsed;
}

export async function mutateTechRadarStore(mutator) {
  const run = writeChain.then(async () => {
    const store = await readTechRadarStore();
    const next = (await mutator(store)) || store;
    next.updatedAt = nowIso();
    await atomicWriteJson(RADAR_FILE, next);
    return next;
  });
  writeChain = run.catch(() => {});
  return run;
}
