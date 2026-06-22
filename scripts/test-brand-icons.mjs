#!/usr/bin/env node
/** 猎户座品牌图标：public SVG 须为合法 XML */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "apps/web-react/public");

function assertValidSvg(file) {
  const full = path.join(PUBLIC, file);
  const xml = fs.readFileSync(full, "utf8");
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(xml)) {
    throw new Error(`${file}: contains control characters`);
  }
  if (!xml.includes('xmlns="http://www.w3.org/2000/svg"')) {
    throw new Error(`${file}: missing svg xmlns`);
  }
  const lint = spawnSync("xmllint", ["--noout", full], { encoding: "utf8" });
  if (lint.error?.code === "ENOENT") return;
  if (lint.status !== 0) {
    throw new Error(`${file}: ${lint.stderr?.trim() || "invalid XML"}`);
  }
}

function main() {
  for (const file of ["favicon.svg", "apple-touch-icon.svg"]) {
    assertValidSvg(file);
  }
  console.log("[test:brand-icons] ok: favicon.svg + apple-touch-icon.svg");
}

try {
  main();
} catch (error) {
  console.error("[test:brand-icons] fail:", error.message);
  process.exit(1);
}
