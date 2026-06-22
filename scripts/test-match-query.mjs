#!/usr/bin/env node
/** UC-002：分析主题严匹配（俄乌勿误收仅「地缘」类目） */

import { matchesAnalysisQuery, matchesQuery } from "../services/api/src/use-cases/uc-002-event-analysis/match-query.mjs";
import { scoreIntakeEvent, intakeQueryTerms } from "../services/api/src/use-cases/uc-001-daily-events/intake-match.mjs";

const comradeKeir = {
  id: "news-comrade-keir",
  title: "'Comrade Keir' or just (finally) rational UK energy policy? - Responsible Statecraft",
  summary: "存在值得跟踪的变化；对象：Comrade、Keir、Responsible。",
  category: "地缘",
  tags: ["地缘", "供应链", "最新", "外部来源"],
  severity: 64
};

const ukraineBriefing = {
  id: "news-ukraine-war",
  title: "Ukraine war briefing: frontline updates and NATO aid package",
  summary: "Russian forces pressed along the eastern front as Ukraine received additional military aid.",
  category: "地缘",
  tags: ["俄乌", "地缘"],
  severity: 88
};

const cases = [
  {
    name: "broad matchesQuery no longer matches tag-only 地缘",
    run: () => matchesQuery(comradeKeir, "俄乌冲突") === false
  },
  {
    name: "analysis query excludes UK energy Comrade Keir",
    run: () => matchesAnalysisQuery(comradeKeir, "俄乌冲突") === false
  },
  {
    name: "analysis query includes Ukraine war briefing",
    run: () => matchesAnalysisQuery(ukraineBriefing, "俄乌冲突") === true
  },
  {
    name: "non-RU query unchanged",
    run: () => matchesAnalysisQuery({ title: "红海航运成本", category: "地缘", tags: ["地缘"] }, "中东局势") === true
  },
  {
    name: "AI tech query excludes Ukraine war headline",
    run: () =>
      matchesAnalysisQuery(
        {
          title: "Russia overspends on Putin's war in Ukraine by $28bn - Financial Times",
          summary: "war spending",
          category: "地缘",
          tags: ["地缘"]
        },
        "AI技术"
      ) === false
  },
  {
    name: "tech scoring matches GPT mention in timeline",
    run: () => {
      const terms = intakeQueryTerms("AI技术");
      const event = {
        title: "AI platform policy update",
        summary: "general AI policy",
        category: "科技",
        tags: ["科技"],
        timeline: [{ text: "OpenAI 发布 Scaling Trusted Access for Cyber with GPT-5.5" }]
      };
      return scoreIntakeEvent(event, "AI技术", terms, "科技") >= 1;
    }
  },
  {
    name: "tech analysis matches NVIDIA not Gripen",
    run: () => {
      const gripen = {
        title: "Ukraine war briefing: Gripen fighter jet deal ramps up after Zelenskyy visit to Sweden - The Guardian",
        summary: "war",
        category: "地缘",
        tags: ["地缘"]
      };
      const nvidia = {
        title: "NVIDIA Dynamo Snapshot: Fast Startup for Inference Workloads on Kubernetes | NVIDIA Technical Blog",
        summary: "AI inference kubernetes",
        category: "科技",
        tags: ["科技", "AI"]
      };
      return matchesAnalysisQuery(gripen, "AI技术") === false && matchesAnalysisQuery(nvidia, "AI技术") === true;
    }
  },
  {
    name: "intake score zero for geo-only ai substring",
    run: () => {
      const terms = intakeQueryTerms("搜索AI技术");
      const score = scoreIntakeEvent(
        {
          title: "Russia overspends on Putin's war in Ukraine by $28bn - Financial Times",
          summary: "x",
          category: "地缘",
          tags: []
        },
        "搜索AI技术",
        terms,
        "科技"
      );
      return score === 0;
    }
  }
];

let failed = 0;
for (const item of cases) {
  let ok = false;
  try {
    ok = Boolean(item.run());
  } catch (error) {
    console.error(`✗ ${item.name}: ${error.message}`);
    failed += 1;
    continue;
  }
  if (ok) {
    console.log(`✓ ${item.name}`);
  } else {
    console.error(`✗ ${item.name}`);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`match-query: ${cases.length} passed`);
