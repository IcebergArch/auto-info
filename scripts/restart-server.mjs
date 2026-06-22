import { execSync, spawn } from "node:child_process";
import process from "node:process";

function stopExisting() {
  try {
    execSync(`pkill -f "node server.mjs"`, { stdio: "ignore" });
  } catch {
    // no running process matched
  }
}

function startServer() {
  const child = spawn("npm", ["start"], {
    stdio: "inherit",
    env: process.env
  });
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code);
  });
}

stopExisting();
startServer();
