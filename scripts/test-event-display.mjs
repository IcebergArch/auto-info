#!/usr/bin/env node
/** UC-001 事件展示：去重标签前缀 + 中文主题标题 */

import { buildFactualChineseTitle, cjkCount } from "../services/api/src/use-cases/uc-003-reading-assistant/chinese-brief.mjs";
import {
  buildEventDisplayTitle,
  buildEventDisplaySummary,
  isOverviewJunkLine,
  overviewFactFromEvent,
  presentEventForReport,
  stripLeadingLabel
} from "../services/api/src/use-cases/uc-001-daily-events/event-display.mjs";
import { classifyReportBlock } from "../services/api/src/use-cases/uc-001-daily-events/service.mjs";
import {
  buildEventChronology,
  selectChartMilestones
} from "../services/api/src/use-cases/uc-002-event-analysis/timeline-build.mjs";

const cases = [
  {
    name: "strip duplicate direction label",
    run: () => stripLeadingLabel("国际局势：红海绕行成本上升", ["国际局势"]) === "红海绕行成本上升"
  },
  {
    name: "presentation headline topic-focused",
    run: () => {
      const event = {
        title: "Assistant Governor, Thomas Harr's presentation at the Experian Innovation Summit - Danmarks Nationalbank",
        summary: "Assistant Governor, Thomas Harr's presentation at the Experian Innovation Summit &nbsp;&nbsp; Danmarks Nationalbank",
        category: "金融"
      };
      const title = buildEventDisplayTitle(event);
      return title.includes("丹麦央行") && title.includes("：") && !/发表演讲/.test(title);
    }
  },
  {
    name: "no template fluff summary",
    run: () => {
      const presented = presentEventForReport({
        title: "Assistant Governor, Thomas Harr's presentation at the Experian Innovation Summit - Danmarks Nationalbank",
        summary: "Assistant Governor, Thomas Harr's presentation at the Experian Innovation Summit",
        category: "金融"
      });
      return (
        Boolean(presented.displayTitle)
        && !/发表演讲，属.+相关动态/.test(presented.summary)
        && /[\u4e00-\u9fff]{6,}/.test(presented.summary)
      );
    }
  },
  {
    name: "classify finance vs international",
    run: () => classifyReportBlock({ title: "Fed rate", category: "金融" }) === "finance"
      && classifyReportBlock({ title: "Ukraine war briefing", category: "地缘" }) === "international"
  },
  {
    name: "classify domestic life and media",
    run: () => classifyReportBlock({ title: "流感季疫苗接种提示", category: "未分类" }) === "domestic"
      && classifyReportBlock({ title: "某梗冲上热搜", summary: "短视频平台 meme", category: "未分类" }) === "domestic"
  },
  {
    name: "chart milestones cover mid years for ru conflict",
    run: () => {
      const chronology = buildEventChronology([], { query: "俄乌冲突" });
      const milestones = selectChartMilestones(chronology, "俄乌冲突");
      const years = new Set(milestones.map((item) => new Date(item.at).getUTCFullYear()));
      return years.has(2022) && years.has(2014) && [2023, 2024, 2025].some((y) => years.has(y));
    }
  },
  {
    name: "amazon invest title and desc",
    run: () => {
      const presented = presentEventForReport({
        title: "Amazon Invests $20 Billion in UK, Plans £40 Billion by 2027 - Global Banking & Finance Review",
        summary: "Amazon Invests $20 Billion in UK, Plans £40 Billion by 2027",
        category: "金融"
      });
      return (
        presented.displayTitle.includes("亚马逊")
        && presented.displayTitle.includes("英国")
        && /[\u4e00-\u9fff]{8,}/.test(presented.desc || "")
        && !/建议点击 ↗ 查看英文原文/.test(presented.desc || "")
      );
    }
  },
  {
    name: "feishu url title clickable desc",
    run: () => {
      const url = "https://j0yswlgboxz.feishu.cn/wiki/WveZwRuN1iQwX1kWjYPcCFDLnkb";
      const presented = presentEventForReport({
        title: url,
        summary: "围绕「https://j0yswlgboxz.feishu.cn/wiki/WveZwRuN1iQwX1kWjYPcCFDLnkb」建立的未分类类观察条目。",
        category: "未分类"
      });
      return (
        presented.displayTitle.includes("飞书")
        && /[\u4e00-\u9fff]{6,}/.test(presented.desc || "")
        && !/建议点击 ↗ 查看英文原文/.test(presented.desc || "")
      );
    }
  },
  {
    name: "english title avoids generic tracking fluff",
    run: () => {
      const presented = presentEventForReport({
        title: "OpenAI Deployment Guide for GPT-5.5 Cyber Access - Federal News",
        summary: "OpenAI published a deployment guide for trusted cyber access with GPT-5.5.",
        category: "科技"
      });
      const blob = `${presented.displayTitle} ${presented.desc}`;
      return (
        !/值得跟踪/.test(blob)
        && !/存在值得跟踪的变化/.test(blob)
        && /OpenAI|GPT|部署|发布/.test(blob)
      );
    }
  },
  {
    name: "lummis clarity act decision copy",
    run: () => {
      const presented = presentEventForReport({
        title: "Lummis: Clarity Act Will Decide Whether US Leads Next-Gen Finance or Falls Behind - Cryptonews.net",
        summary: "呈下行或节奏放缓；对象：Lummis、Clarity、Act；主体：Lummis、Clarity、Act。",
        category: "金融"
      });
      const blob = `${presented.displayTitle} ${presented.desc}`;
      return (
        /Clarity Act|监管|金融/.test(blob)
        && !/值得跟踪|呈下行|对象：/.test(blob)
        && cjkCount(presented.desc) >= 16
      );
    }
  },
  {
    name: "cbn tightening decision copy",
    run: () => {
      const presented = presentEventForReport({
        title: "Monetary Tightening Deepens as CBN Withdraws ₦7.30 Trillion From Banking System - nigeriahousingmarket.com",
        summary: "存在值得跟踪的变化；数据：7.30；对象：Monetary、Tightening、Deepens；主体：Monetary、Tightening、Deepens。",
        category: "金融"
      });
      const blob = `${presented.displayTitle} ${presented.desc}`;
      return /尼日利亚|回笼|紧缩|奈拉|7\.30/.test(blob) && !/值得跟踪|对象：/.test(blob);
    }
  },
  {
    name: "overview junk entity lists rejected",
    run: () =>
      isOverviewJunkLine("Take、Future相关报道")
      && isOverviewJunkLine("Powerbox、ECDD、Bisinfotech")
      && isOverviewJunkLine("Vietnam、Singapore")
      && isOverviewJunkLine("LEAD、Seoul相关报道")
      && isOverviewJunkLine("Geostratum、Intelligence、LLC")
      && !isOverviewJunkLine("红海航运与保险成本再度成为供应链焦点")
  },
  {
    name: "stored junk summary rewritten for overview",
    run: () => {
      const presented = presentEventForReport({
        title: "LEAD Tech Stocks Rally in Seoul as Forex Today Moves - Bisinfotech",
        summary: "LEAD、Seoul相关报道。",
        displayTitle: "LEAD、Seoul相关报道",
        category: "科技"
      });
      return !isOverviewJunkLine(presented.displayTitle) && cjkCount(presented.displayTitle) >= 4;
    }
  },
  {
    name: "opinion ai title avoids take future template",
    run: () => {
      const title =
        "Opinion | We Have to Take the Future of A.I. Into Our Own Hands - The New York Times";
      const factual = buildFactualChineseTitle(title, "科技");
      const presented = presentEventForReport({
        title,
        summary: "Take、Future相关报道。",
        category: "科技"
      });
      const blob = `${presented.displayTitle} ${presented.desc} ${factual}`;
      return !/Take、Future|相关报道/.test(blob) && cjkCount(blob) >= 12;
    }
  },
  {
    name: "overview fact prefers displayTitle",
    run: () => {
      const fact = overviewFactFromEvent({
        displayTitle: "丹麦央行 Harr：通胀与宏观金融政策",
        summary: "国际局势：不应重复"
      });
      return fact.startsWith("丹麦央行") && !fact.startsWith("国际局势");
    }
  }
];

let failed = 0;
for (const item of cases) {
  try {
    if (!item.run()) {
      console.error(`[test:event-display] fail: ${item.name}`);
      failed += 1;
    } else {
      console.log(`[test:event-display] ok: ${item.name}`);
    }
  } catch (error) {
    console.error(`[test:event-display] error: ${item.name}`, error.message);
    failed += 1;
  }
}

if (failed) process.exit(1);
console.log(`[test:event-display] done: ${cases.length} passed`);
