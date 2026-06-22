import { normalizeEvent } from "../../shared/event-model.mjs";
import { safeSlug, nowIso } from "../../shared/utils.mjs";
import { readEventStore } from "../../shared/store.mjs";
import { intakeEventQuery } from "../uc-001-daily-events/intake.mjs";
import { upsertEvents } from "../uc-001-daily-events/service.mjs";
import { resolveAnalysisWindow } from "./analysis-window.mjs";
import { isRussiaUkraineQuery, matchesQuery } from "./match-query.mjs";

const RU_UA_LANE_SEEDS = [
  {
    id: "intel-ru-ua-2014",
    title: "东乌局势与克里米亚",
    occurredAt: "2014-02-20T00:00:00.000Z",
    summary: "2014 年起东乌克兰局势升级，克里米亚并入俄罗斯，顿巴斯武装冲突持续。",
    tags: ["地缘", "冲突", "重大"],
    severity: 88,
    special: true
  },
  {
    id: "intel-ru-ua-2022-invade",
    title: "2022 全面军事行动",
    occurredAt: "2022-02-24T00:00:00.000Z",
    summary: "2022 年 2 月 24 日俄方宣布在乌东开展特别军事行动，冲突全面升级，欧美启动多轮制裁。",
    tags: ["地缘", "冲突", "制裁", "重大"],
    severity: 96,
    special: true
  },
  {
    id: "intel-ru-ua-2022-energy",
    title: "能源与制裁博弈",
    occurredAt: "2022-09-01T00:00:00.000Z",
    summary: "欧美对俄能源与金融制裁深化，欧洲天然气供应格局重塑，全球能源价格剧烈波动。",
    tags: ["地缘", "能源", "制裁", "供应链"],
    severity: 90,
    special: true
  },
  {
    id: "intel-ru-ua-2023-counter",
    title: "乌方反攻与军援",
    occurredAt: "2023-06-01T00:00:00.000Z",
    summary: "乌克兰反攻与西方军援节奏影响战线变化，北约援助规模与武器类型成为关键变量。",
    tags: ["地缘", "冲突", "重大"],
    severity: 89,
    special: true
  },
  {
    id: "intel-ru-ua-2024-stalemate",
    title: "长期化与谈判窗口",
    occurredAt: "2024-01-15T00:00:00.000Z",
    summary: "冲突进入消耗战阶段，和谈与领土议题反复，粮食与黑海航运外溢影响持续。",
    tags: ["地缘", "冲突", "航运"],
    severity: 85,
    special: false
  },
  {
    id: "intel-ru-ua-market",
    title: "全球市场外溢",
    occurredAt: "2022-03-01T00:00:00.000Z",
    summary: "冲突推升大宗商品与航运保险成本，全球通胀与央行政策路径受到扰动。",
    tags: ["地缘", "市场", "通胀", "供应链"],
    severity: 84,
    special: false
  }
];

function seedToEvent(seed) {
  return normalizeEvent({
    id: seed.id,
    title: seed.title,
    category: "地缘",
    region: "欧洲",
    summary: seed.summary,
    tags: seed.tags,
    severity: seed.severity,
    special: seed.special,
    occurredAt: seed.occurredAt,
    timeline: [
      {
        at: seed.occurredAt,
        label: seed.title,
        text: seed.summary
      }
    ],
    impacts: [
      ["risk", "地缘风险", seed.summary],
      ["market", "市场外溢", "能源、粮食与航运成本波动"]
    ]
  });
}

async function upsertLaneSeeds(query) {
  if (!isRussiaUkraineQuery(query)) return 0;
  const events = RU_UA_LANE_SEEDS.map(seedToEvent);
  const result = await upsertEvents({ events });
  return result.error ? 0 : events.length;
}

function supplementalQueries(query) {
  const list = [String(query || "").trim()];
  if (isRussiaUkraineQuery(query)) {
    list.push("Ukraine Russia war sanctions energy", "俄乌 制裁 天然气", "乌克兰 军援 反攻");
  }
  return [...new Set(list.filter(Boolean))];
}

export async function enrichEventsFromIntel(query) {
  const intel = {
    queries: [],
    articlesIngested: 0,
    seedsUpserted: 0,
    matched: 0
  };

  for (const q of supplementalQueries(query)) {
    intel.queries.push(q);
    const intake = await intakeEventQuery({
      query: q,
      category: "地缘",
      searchLatest: true,
      skipArchive: true,
      skipHistory: true
    }).catch(() => null);
    if (intake?.sourceSearch?.articles?.length) {
      intel.articlesIngested += intake.sourceSearch.articles.length;
    }
  }

  intel.seedsUpserted = await upsertLaneSeeds(query);

  const store = await readEventStore();
  const now = Date.now();
  const { startTs } = resolveAnalysisWindow(query, now);

  const matched = store.events.filter((event) => {
    if (!matchesQuery(event, query)) return false;
    const ts = new Date(event.occurredAt || 0).getTime();
    return Number.isFinite(ts) && ts >= startTs && ts <= now;
  });

  intel.matched = matched.length;
  return { events: matched, intel };
}
