import { spawn } from "node:child_process";
import process from "node:process";

function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env }
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[start:dev] ${name} exited with code ${code}`);
    }
  });
  return child;
}

const backendPort = process.env.PORT || "4173";
const frontendPort = process.env.WEB_PORT || "5174";

console.log(`[start:dev] backend: http://127.0.0.1:${backendPort}`);
console.log(`[start:dev] frontend: http://127.0.0.1:${frontendPort}`);

// 后端用 node --watch 自动重载：改后端代码后无需手动重启（监视 services/api 源码）
const backend = run(
  "backend",
  "node",
  ["--watch-path=./services/api/src", "server.mjs"],
  { PORT: backendPort }
);
const frontend = run("frontend", "npm", ["--prefix", "apps/web-react", "run", "dev", "--", "--port", frontendPort]);

function shutdown() {
  backend.kill("SIGTERM");
  frontend.kill("SIGTERM");
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
