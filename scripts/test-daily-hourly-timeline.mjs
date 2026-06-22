#!/usr/bin/env node
/** 今日日报：其他分栏 + 按小时分桶 */

import {
  collectReportEventsForTimeline,
  groupTimelineByHour
} from "../services/api/src/use-cases/uc-001-daily-events/daily-timeline-hourly.mjs";
import { classifyReportBlock } from "../services/api/src/use-cases/uc-001-daily-events/service.mjs";

function assert(cond, msg) {
  if (!cond) {
    console.error("[test:daily-hourly-timeline] fail:", msg);
    process.exit(1);
  }
}

const sampleReport = {
  events: [
    {
      id: "e1",
      title: "OpenAI blog update",
      category: "科技",
      occurredAt: "2026-06-01T08:15:00.000Z"
    }
  ],
  sections: [
    {
      key: "other",
      title: "其他",
      subsections: [
        {
          title: "体育",
          events: [
            {
              id: "e2",
              title: "FIFA World Cup qualifier result shifts group standings",
              displayTitle: "世预赛结果改写作风小组排名",
              summary:
                "东道主客场告负后出线形势收紧，转播与赞助合约面临重新评估，区域票务收入预期下调。",
              desc: "东道主客场告负后出线形势收紧，转播与赞助合约面临重新评估，区域票务收入预期下调。",
              category: "体育",
              occurredAt: "2026-06-01T08:45:00.000Z"
            }
          ]
        }
      ]
    }
  ]
};

const merged = collectReportEventsForTimeline(sampleReport);
assert(merged.length === 2, "sections.subsections events must merge into timeline source");

assert(classifyReportBlock({ title: "网球大满贯决赛", category: "体育" }) === "other", "体育应归 other");

const hours = groupTimelineByHour([
  {
    id: "e1",
    at: "2026-06-01T08:15:00.000Z",
    lane: "technology",
    displayTitle: "科技样例"
  },
  {
    id: "e2",
    at: "2026-06-01T09:45:00.000Z",
    lane: "other",
    displayTitle: "体育样例"
  },
  {
    id: "e3",
    at: "2026-06-01T08:45:00.000Z",
    lane: "other",
    displayTitle: "同小时样例"
  }
]);
assert(hours.length === 2, "two distinct product-time hours should be two buckets");
assert(hours[0].events.length === 1, "latest hour bucket first");
assert(hours[0].hourKey.endsWith("T17:00"), "hour buckets sorted by product-time hour descending");
assert(hours[1].events.length === 2, "earlier hour bucket second");
assert(
  new Date(hours[1].events[0].at).getTime() <= new Date(hours[1].events[1].at).getTime(),
  "events within hour sorted ascending"
);

const sameHourOnly = groupTimelineByHour([
  {
    id: "e1",
    at: "2026-06-01T08:15:00.000Z",
    lane: "technology",
    displayTitle: "科技样例"
  },
  {
    id: "e2",
    at: "2026-06-01T08:45:00.000Z",
    lane: "other",
    displayTitle: "体育样例"
  }
]);
assert(sameHourOnly.length === 1, "same product-time hour should be one bucket");
assert(sameHourOnly[0].events.length === 2, "hour bucket should contain two events");

import {
  buildTimelineEntries,
  sortTimelineEntriesDesc
} from "../services/api/src/use-cases/uc-001-daily-events/daily-report-presentation.mjs";

const undatedSample = [
  {
    id: "u1",
    title: "Amazon invests twelve billion in cloud AI infrastructure",
    displayTitle: "亚马逊宣布120亿美元云与AI基础设施投资",
    summary: "资本开支上调将拉长供应商订单周期，并推高GPU与电力设备需求。",
    category: "科技",
    occurredAt: ""
  },
  {
    id: "t1",
    title: "NVIDIA data center revenue beats Wall Street estimates",
    displayTitle: "英伟达数据中心收入超预期",
    summary: "AI 芯片需求指引上调，半导体供应链与电力设备板块获资金追捧。",
    category: "科技",
    occurredAt: "2026-06-01T09:00:00.000Z"
  }
];

const built = buildTimelineEntries(undatedSample, classifyReportBlock);
const undated = built.find((i) => i.id === "u1");
const timed = built.find((i) => i.id === "t1");
assert(undated?.undated === true, "missing occurredAt should be undated");
assert(timed?.undated !== true && timed?.at, "timed event keeps at");

const orderSample = sortTimelineEntriesDesc([
  { id: "a", at: "2026-06-02T08:00:00.000Z" },
  { id: "b", at: "2026-06-02T14:00:00.000Z" },
  { id: "c", undated: true }
]);
assert(orderSample[0].id === "b", "timeline sort must be newest first");
assert(orderSample[orderSample.length - 1].id === "c", "undated must stay last");

console.log("[test:daily-hourly-timeline] ok");
