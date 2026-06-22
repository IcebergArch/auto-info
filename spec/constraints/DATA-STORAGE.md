# 数据存储规范（本地环境）

## 允许组件

本地开发可使用以下数据存储组件：

- MySQL
- Neo4j

## 命名规范

- **MySQL 数据库名：`auto-info`**
- **Neo4j**：Community 版仅支持默认库 `neo4j`；图谱数据通过 `(:Event)` / `(:Tag)` 标签隔离，配置项 `graph.neo4j.database` 须为 `neo4j`（若配置为不存在的库名，API 会自动回退 `neo4j` 并记录原因）

## 本地启动命令

```bash
brew services start mysql neo4j
# 若 launchctl 启动失败，可改用：neo4j start
```

示例启动结果：

- `Successfully started mysql`
- `Successfully started neo4j`

### Neo4j Browser（`http://localhost:7474/browser/`）

- **Bolt `7687` / HTTP 根路径 `200`** 即表示图谱服务可用（auto-info UC-002 主要用 Bolt）。
- 若 Browser 返回 **403 Forbidden**：Homebrew `neo4j` 2026.x 常只附带 `libexec/web/neo4j-browser-*.zip` 未解压。执行一次：

```bash
cd "$(brew --prefix neo4j)/libexec/web"
unzip -qo neo4j-browser-*.zip
neo4j restart   # 或 neo4j stop && neo4j start
```

- 解压后 `curl -s -o /dev/null -w '%{http_code}' http://localhost:7474/browser/` 应为 `200`。
- 亦可使用托管 Browser：https://browser.neo4j.io/ ，连接 `bolt://localhost:7687`（账号见本机 `neo4j` 用户密码）。

## 使用约定

1. **MySQL 为结构化数据主存储**：事件、日报、咨询历史、阅读历史优先进入 MySQL 数据库 `auto-info`。
2. **Neo4j 为事件分析图谱主存储（UC-002）**：优先写入并查询事件节点、关系边、影响维度；不可用时自动降级到本地内存图谱算法。
3. 仅在 `spec/` 已定义需求与契约后，才可引入 MySQL / Neo4j 持久化实现。  
4. 若新增数据库依赖或连接方式，必须先更新：  
   - `spec/requirements/`（需求层）  
   - `spec/contracts/`（API/数据契约）  
   - 本文件（环境与命名约束）  
5. 现有 `data/*.json` 可继续作为本地回退或测试数据，不与数据库命名冲突。
6. auto-info 日报快照目标进入 MySQL；`data/auto-info-reports.json` 作为本地降级缓存。
7. **科技雷达**（UC-006）：`data/auto-info-tech-radar.json`，字段见 `spec/contracts/API-uc-006-tech-radar.md`。
7. 手动“更新数据”触发事件库刷新并写回 MySQL；MySQL 不可用时写入 JSON 降级缓存并在配置页显示。

## 无 npm 依赖连接策略

- MySQL MVP 链路优先使用本机 `mysql` CLI 执行 schema 初始化与同步；若 CLI 或服务不可用，返回清晰状态。
- Neo4j MVP 链路优先检查 Bolt 端口 `7687` 与 HTTP 端口 `7474`；若配置了 HTTP 账号，可通过事务 HTTP API 同步图谱。
- UC-002 图谱写入最少包含：`(:Event)` 节点、`(:Tag)` 节点、`[:TAGGED_AS]`、`[:RELATED_TO]` 关系，关系需记录 `type/tone/weight/dimension/influence` 属性；节点 `impacts` 以 `impactsJson` 字符串存储（Neo4j 不支持嵌套数组属性）。
- 后续若允许新增依赖，可改为官方驱动，但必须先更新本文件和 `CODING-STANDARDS.md`。

## 禁止

- 使用不一致数据库名（如 `auto_info`、`nexus`）作为主库名  
- 未更新 `spec/` 就直接提交数据库接入代码  
