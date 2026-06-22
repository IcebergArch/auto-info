import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REQUIRED_PATHS = [
  "spec/README.md",
  "spec/requirements/REQUIREMENTS.md",
  "spec/use-cases/UC-001-daily-major-events.md",
  "spec/use-cases/UC-002-event-tag-analysis.md",
  "spec/use-cases/UC-003-reading-assistant.md",
  "spec/use-cases/UC-004-system-config.md",
  "spec/constraints/LAW.md",
  "spec/constraints/NORMS.md",
  "spec/constraints/REFERENCES.md",
  "spec/constraints/DIRECTORY-STRUCTURE.md",
  "spec/constraints/RUN-VERIFICATION.md",
  "spec/constraints/CODING-STANDARDS.md",
  "spec/constraints/UI-DESIGN.md",
  "spec/constraints/PROJECT-CLEANUP.md",
  "services/api/src/server.mjs",
  "apps/web-react/package.json",
  "apps/web-react/src/main.tsx",
  "scripts/verify.mjs",
  "scripts/audit-structure.mjs",
  "data/seed-events.json",
  "docs/architecture/SYSTEM_DESIGN.md",
  "docs/rules/CODING_RULES.md",
  "docs/rules/TASK_TEMPLATE.md",
  "docs/rules/TEAM_WORKFLOW.md",
  "docs/iterations/REFACTOR_10X_PROGRAM.md",
  "docs/iterations/REFACTOR_10X_EXECUTION_LOG.md",
  "server.mjs",
  "package.json",
  "AGENTS.md"
];

const FORBIDDEN_PATHS = [
  "backend",
  "public",
  "std",
  "index.html",
  "app.js",
  "styles.css"
];

const USE_CASE_DIRS = [];

const errors = [];
const warnings = [];

function log(kind, message) {
  console.log(`[audit] ${kind}: ${message}`);
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isEmptyDir(dirPath) {
  if (!isDir(dirPath)) return false;
  const entries = readdirSync(dirPath).filter((name) => name !== ".DS_Store");
  return entries.length === 0;
}

function checkRequired() {
  for (const rel of REQUIRED_PATHS) {
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) {
      errors.push(`缺少必需路径: ${rel}`);
    }
  }
}

function checkForbidden() {
  for (const rel of FORBIDDEN_PATHS) {
    const abs = path.join(ROOT, rel);
    if (existsSync(abs)) {
      errors.push(`存在已废弃路径（应删除或迁移）: ${rel}`);
    }
  }
}

function checkUseCases() {
  for (const rel of USE_CASE_DIRS) {
    const abs = path.join(ROOT, rel);
    if (!isDir(abs)) {
      errors.push(`缺少用例目录: ${rel}`);
    }
  }
}

function checkNoDuplicateFrontend() {
  const webFiles = ["index.html", "app.js", "styles.css"];
  for (const file of webFiles) {
    const rootFile = path.join(ROOT, file);
    const appFile = path.join(ROOT, "apps/web-react", file);
    if (existsSync(rootFile) && existsSync(appFile)) {
      errors.push(`根目录与 apps/web-react/ 重复前端文件: ${file}（仅保留 apps/web-react/）`);
    }
  }
}

function checkStrayTopLevel() {
  const allowedDirs = new Set(["spec", "services", "apps", "scripts", "data", ".cursor", ".idea", "docs"]);
  const allowedFiles = new Set(["AGENTS.md", "README.md", "package.json", "server.mjs"]);

  for (const name of readdirSync(ROOT)) {
    if (name === ".git" || name === "node_modules") continue;
    const abs = path.join(ROOT, name);
    if (isDir(abs)) {
      if (!allowedDirs.has(name)) {
        warnings.push(`根目录非常规文件夹（确认是否应迁入 spec/services/apps 或删除）: ${name}/`);
      }
    } else if (!name.startsWith(".") && !allowedFiles.has(name)) {
      warnings.push(`根目录非常规文件（确认是否应迁移或删除）: ${name}`);
    }
  }
}

function main() {
  log("start", "目录结构审查");
  checkRequired();
  checkForbidden();
  checkUseCases();
  checkNoDuplicateFrontend();
  checkStrayTopLevel();

  for (const w of warnings) log("warn", w);
  for (const e of errors) log("error", e);

  if (errors.length) {
    log(
      "hint",
      "请对照 spec/constraints/DIRECTORY-STRUCTURE.md 清理废弃目录并补齐必需路径"
    );
    process.exit(1);
  }

  log("done", warnings.length ? `通过（${warnings.length} 条警告，建议人工确认）` : "通过，结构符合 STDD 规范");
}

main();
