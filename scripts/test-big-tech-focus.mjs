#!/usr/bin/env node

import {
  entryMatchesBigTechFocus,
  matchBigTechPlatform,
  scoreBigTechFocus
} from "../services/api/src/use-cases/uc-006-tech-radar/big-tech-focus.mjs";

let failed = 0;

function ok(name, cond) {
  if (cond) console.log(`[test:big-tech-focus] ok: ${name}`);
  else {
    console.error(`[test:big-tech-focus] fail: ${name}`);
    failed += 1;
  }
}

ok("google", matchBigTechPlatform("Google Gemini update", "https://blog.google/technology/ai/")?.id === "google");
ok("anthropic", matchBigTechPlatform("Claude 4 release", "https://www.anthropic.com/news")?.id === "anthropic");
ok("x", matchBigTechPlatform("xAI Grok", "https://blog.x.com/")?.id === "x");
ok("paper boost", scoreBigTechFocus({ title: "GPT-5 arxiv preprint", url: "https://arxiv.org/abs/1234" }) >= 70);
ok(
  "entry tag",
  entryMatchesBigTechFocus({ title: "OpenAI API", tags: ["大厂"], sources: [{ url: "https://openai.com" }] })
);

if (failed) process.exit(1);
console.log("[test:big-tech-focus] done");
