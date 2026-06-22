# 运行验证约束（每次更新完成后强制执行）

## 目标

每次代码或规格落地后，必须确认项目**能启动、无运行时错误、核心接口可访问**。

## 必须执行的命令

在项目根目录依次执行：

```bash
npm run verify
```

`verify` 会自动完成：

1. **目录结构审查**（`npm run audit`，见 `DIRECTORY-STRUCTURE.md`）  
2. 对关键 `.mjs` 做 `node --check` 语法检查  
3. 临时启动服务（默认 `127.0.0.1:4317`，可用 `VERIFY_PORT` 覆盖）  
4. 冒烟请求：首页、`/api/v1/daily-events/today`、`/api/v1/analysis/tags`、`/api/v1/reading-assistant/history`  
5. **URL 可达性验证**：校验首页 URL 返回 `200`、内容长度有效、且为预期 HTML 页面  
6. 退出码 `0` 表示通过；非 `0` 必须修复后再交付  

单独审查目录：

```bash
npm run audit
```

强制启动确认：

```bash
npm run restart:clean
```

每次调整完成后，必须先停止旧实例再启动新实例，避免后台终端堆叠。  
推荐统一执行 `npm run restart:clean`（会先关闭旧 `node server.mjs` 进程，再启动新实例）。  
启动成功标准：出现可访问地址或启动成功日志；启动失败不得交付。

双端在线确认（强制）：

```bash
curl -fsS http://127.0.0.1:4173/api/v1/config
curl -fsS http://localhost:5174/
```

- 后端（4173）只应返回 API/健康 JSON，不得返回 HTML 页面。
- 每次修改后交付前，必须确认 Node 后端（4173）+ 前端（5174）均在线。
- 若后端启动因端口占用自动落到 4174+ 等 fallback 端口，不得视为双端在线通过；必须停止占用 4173 的旧进程并用本轮代码重启到标准端口后再检查。
- 任一检查失败都不得交付，必须先修复启动链路并重新检查。

## 失败处理

- **verify 失败**：不得向用户宣称“已完成”；先修复错误并重新 `npm run verify`  
- **端口占用**：设置 `VERIFY_PORT=4320 npm run verify` 或释放占用端口  
- **仅改 spec 文档**：仍建议执行 `npm run verify`，确保实现与契约未脱节  

## Agent 交付前检查清单

- [ ] `npm run audit` 通过（无结构 error）  
- [ ] `npm run verify` 通过（exit code 0）  
- [ ] `npm run restart:clean` 已执行且服务成功启动  
- [ ] Node/前端双端在线检查通过（4173/5174）  
- [ ] **新功能/行为变更**：已按 `FEATURE-TESTING.md` 做功能点测试  
- [ ] 若改了 UI，页面可打开且无明显脚本报错  
- [ ] 若改了 API，与 `spec/contracts/` 一致，且冒烟已覆盖  
