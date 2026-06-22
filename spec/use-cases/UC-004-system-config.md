# UC-004：系统配置与链路状态

**Implements:** REQ-F-004  
**Actors:** 用户（主）、配置存储服务（次）、MySQL / Neo4j / 外部信源（次）  
**Preconditions:** 服务已启动  
**Postconditions:** 用户能查看并调整信源、模型和数据库连接配置，并看到链路状态  

## 触发

用户点击顶栏「配置」按钮，进入配置页。

## 主流程

1. 前端请求 `GET /api/v1/config`。
2. 系统返回当前 MySQL、Neo4j、Google Search、Brave Search、Jina Reader、LLM 配置；敏感 key 只返回掩码。
3. 前端请求 `GET /api/v1/config/status`。
4. 系统探测 MySQL / Neo4j / 信源配置链路状态，展示 connected / degraded / missing；信源支持 `configured`（API 模式）与 `free`（免费通道模式）。
5. 用户修改配置并保存，客户端请求 `PUT /api/v1/config`。
6. 用户可手动触发 `POST /api/v1/config/sync`，同步事件到 MySQL，并尝试同步图谱到 Neo4j。
7. 顶栏必须展示后端连接状态灯（连接中/已连接/部分异常/不可用）与当前 API 基地址，便于快速定位“仅前端启动”问题。

## 异常流

### EXC-1：数据库不可用

- **触发：** MySQL / Neo4j 未启动、CLI 不存在或连接失败  
- **响应：** HTTP 200，状态为 `degraded`，并说明当前使用 JSON 降级缓存

### EXC-2：敏感 key

- **触发：** 配置包含 key  
- **响应：** 存储在本地配置文件；API 读取时仅返回掩码，不在页面显示明文

## 后端模块

`services/api/src/use-cases/uc-004-system-config/`
