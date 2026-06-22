# UC-003：阅读助手解析与历史记录

**Implements:** REQ-F-003  
**Actors:** 用户（主）、阅读会话存储（次）  
**Preconditions:** 服务已启动  
**Postconditions:** 生成摘要报告条目并持久化至历史列表  

## 触发

用户进入阅读助手，在单一输入框中粘贴链接/正文/字幕并提交解析。

## 主流程

1. 用户进入阅读助手页。
2. 用户提供以下一种或多种输入（推荐单一输入框 `smartInput`）：
   - 论文/资料标题（`title`）
   - 智能输入框（`smartInput`）：可混合粘贴网页/PDF/音视频链接与正文/字幕/转写
   - 兼容字段（`webUrl`/`pdfUrl`/`videoUrl`/`audioUrl`/`transcript`/`text`）或上传 txt/md/docx
3. 客户端 `POST /api/v1/reading-assistant/sessions`（JSON 或 multipart）。
4. 系统优先解析 `smartInput`，自动识别来源类型并拆分：
   - 命中 YouTube/Bilibili/Vimeo/TikTok 等视频页或 `.mp4/.webm/.mov/.m3u8` → `videoUrl`
   - 命中播客/音频页或 `.mp3/.m4a/.wav/.aac/.ogg/.flac` → `audioUrl`
   - 命中 `.pdf` 链接 → `pdfUrl`
   - 命中其他 `http/https` 链接 → `webUrl`
   - 其余文本合并为正文/字幕
5. 系统按来源类型抓取或解析文本；网页正文提取优先使用 Jina Reader，失败时降级为基础抽取。音视频支持边界：
   - 用户提供字幕/转写（`transcript` 或链接下方正文）时，按音视频内容生成技术简报；
   - 平台页（如 YouTube/Bilibili/播客页）可尝试抓取页面文字/简介/字幕文本，足够长时生成简报；
   - 直连媒体文件或平台页未取得有效文本时，HTTP 422，提示粘贴字幕/转写；系统不得假装已听取音视频。
6. 系统生成**技术简报**（`paper`），固定三节：**摘要** · **要点** · **建议**（面向工程师/研究员，帮助快速把握文章精髓）。
   - **摘要**：2–4 句，写清背景、方法/机制、结论与边界；禁止模板空话。
   - **要点**：3–6 条，格式「【主题】结论；依据：事实/数据/方法」；至少 2 条且不重复。
   - **建议**：2–5 条可执行行动（验证、复现、查文档、跟踪指标、合规核查等）。
   - 兼容字段：`summary` / `keyPoints` / `recommendations` 与 `paper` 内字段一致；`risks`/`questions` 不再作为主展示。
   - **低信号输入**（仅标题、测试词、未抓取正文）：HTTP 422，不得返回看似完整实则无信息的摘要。
7. 系统默认以 **中文（zh-CN）** 生成摘要报告内容（`summary`、`keyPoints`、`recommendations` 等**必须**为简体中文）。
   - **原文来源**（`sourceName`、URL、产品/API 专有名词）可保留英文；用户通过折叠区「原文来源」↗ 查看细节。
   - 英文正文在无 LLM 时由规则引擎 `chinese-brief.mjs` 转为中文简报；不得把英文句子直接写入摘要/要点。
   - 若未来支持多语言，必须通过显式参数指定；未指定时仍以中文为准。
8. 系统写入 `data/reading-history.json` 并返回 `sessionId`。**同一 URL 或实质相同正文 upsert 唯一会话**（LRU：重复访问/再次分析时更新 `report` 并置顶，`updatedAt` 刷新）；点击历史条目 GET 会话时同样 touch 置顶。
9. 用户可在右侧历史列表 `GET /api/v1/reading-assistant/history` 中查看过往记录（按最近访问排序）；进入阅读助手页时**自动恢复最近一条**简报；点击条目在左侧主区回填完整简报（布局与首页一致：主区 8、历史侧栏 2）。

## 异常流

### EXC-1：无有效正文

- **触发：** 抓取与上传均未得到足够文本（&lt; 20 字符）  
- **响应：** HTTP 422，`error: "无法从来源提取有效正文"`

### EXC-3：低信号输入

- **触发：** 仅标题/测试词、或正文有效语义不足（如「智能输入测试」、仅来源 URL 无正文）  
- **响应：** HTTP 422，区分「抓取失败」「链接无正文」「用户输入过短」；不得用「网页来源：URL」占位符冒充正文

### EXC-4：链接抓取失败

- **触发：** 提供 `webUrl`/`pdfUrl` 但 Jina/直连均未得到 ≥40 字有效正文，且用户未粘贴补充正文  
- **响应：** HTTP 422，提示「链接 + 空行 + 正文」组合输入

### EXC-2：外链抓取失败

- **触发：** `webUrl` / `pdfUrl` 请求超时或非 2xx  
- **响应：** HTTP 422，附 `warnings`；若用户提供了 `text`/`transcript` 则仍尝试摘要

## 后端模块

`services/api/src/use-cases/uc-003-reading-assistant/`
