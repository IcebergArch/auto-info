import { promises as fs } from "node:fs";
import path from "node:path";
import { nowIso } from "../../shared/utils.mjs";
import { normalizeTopic } from "./topic-model.mjs";

const ROOT_DIR = process.cwd();
const DATA_DIR = path.join(ROOT_DIR, "data");
const TOPICS_FILE = path.join(DATA_DIR, "topics.json");

/**
 * 种子议题：迁移自 uc-002 match-query.mjs 的 ALIAS_MAP。
 * 仅在 topics.json 不存在时写入一次，开箱即有可追踪议题。
 */
const SEED_TOPICS = [
  {
    title: "俄乌冲突",
    query: "俄乌冲突",
    aliases: ["俄乌", "乌克兰", "俄罗斯", "乌东", "顿巴斯", "克里米亚", "制裁", "军援", "和谈", "停火"]
  },
  {
    title: "中东局势",
    query: "中东局势",
    aliases: ["中东", "红海", "冲突", "地缘", "航运"]
  },
  {
    title: "台海局势",
    query: "台海",
    aliases: ["台湾", "两岸", "地缘", "军事"]
  },
  {
    title: "AI 技术",
    query: "AI技术",
    aliases: ["人工智能", "大模型", "算力", "芯片", "llm", "gpt", "openai", "anthropic"]
  },
  {
    title: "关税与贸易",
    query: "关税",
    aliases: ["贸易", "出口", "制裁", "供应链"]
  }
];

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

async function ensureTopicsStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  if (await fileExists(TOPICS_FILE)) return;
  const store = {
    version: 1,
    generatedAt: nowIso(),
    topics: SEED_TOPICS.map((seed) => normalizeTopic(seed))
  };
  await atomicWriteJson(TOPICS_FILE, store);
}

export async function readTopicsStore() {
  await ensureTopicsStore();
  const raw = await fs.readFile(TOPICS_FILE, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.topics)) parsed.topics = [];
  return parsed;
}

/** 读-改-写在同一写锁内串行完成，避免并发写丢失 */
export async function mutateTopicsStore(mutator) {
  const run = writeChain.then(async () => {
    const store = await readTopicsStore();
    const result = await mutator(store);
    const next = result?.store || store;
    next.updatedAt = nowIso();
    await atomicWriteJson(TOPICS_FILE, next);
    return result?.value !== undefined ? result.value : next;
  });
  writeChain = run.catch(() => {});
  return run;
}

export { TOPICS_FILE };
