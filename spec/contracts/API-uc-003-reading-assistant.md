# API-UC-003：阅读助手

Base: `/api/v1/reading-assistant`

## POST /sessions

创建阅读会话并生成摘要。网页内容提取优先走 Jina Reader，失败时降级到基础抽取。

**Content-Type:** `application/json` 或 `multipart/form-data`

### 语言约束

- **默认语言**：`report` 内所有自然语言文本（如 `summary`、`keyPoints`、`keywords`、`risks`、`questions`、`warnings`）必须为 **中文（zh-CN）**。
- **可扩展**：如需支持其他语言，必须新增显式请求参数（例如 `lang`）并在契约中定义；未提供语言参数时仍以中文返回。

**JSON Body:**

```json
{
  "title": "论文标题（可选）",
  "smartInput": "智能输入（可混合链接与正文，推荐）",
  "webUrl": "https://...",
  "pdfUrl": "https://.../file.pdf",
  "videoUrl": "https://www.youtube.com/watch?v=...",
  "audioUrl": "https://.../episode.mp3",
  "transcript": "音视频字幕/转写（可选）",
  "text": "直接粘贴正文（可选）"
}
```

**Multipart:** `file`（txt/md/pdf/docx）+ 同上字段

`smartInput` 解析规则（服务端自动识别）：
- 包含 YouTube/Bilibili/Vimeo/TikTok 等视频页或 `.mp4/.webm/.mov/.m3u8` 时识别为 `videoUrl`
- 包含播客/音频页或 `.mp3/.m4a/.wav/.aac/.ogg/.flac` 时识别为 `audioUrl`
- 包含 `.pdf` 链接时识别为 `pdfUrl`
- 其他 `http/https` 链接识别为 `webUrl`
- 非链接内容作为 `text/transcript` 进入摘要；直连音视频文件未提供转写时返回 422，不生成假摘要

**Response 201:**

```json
{
  "sessionId": "read-xxx",
  "report": {
    "sourceName": "...",
    "sourceType": "web|pdf|video|audio|text|file",
    "summary": "...",
    "keyPoints": [],
    "keywords": [],
    "risks": [],
    "questions": [],
    "warnings": [],
    "stats": { "characters": 0, "sentences": 0, "keywords": 0 }
  }
}
```

## GET /history

**Query:** `limit`（默认 50）

**Response 200:** 按 `updatedAt` 降序（LRU）。同 URL 或相同正文仅一条；重复 POST 或 GET touch 会 upsert 并置顶。

```json
{
  "items": [
    {
      "sessionId": "read-xxx",
      "title": "...",
      "sourceType": "web",
      "createdAt": "ISO8601",
      "updatedAt": "ISO8601",
      "summaryPreview": "前 160 字..."
    }
  ],
  "total": 1
}
```

## GET /sessions/:sessionId

返回完整报告与会话元数据；**touch LRU**（置顶并刷新 `updatedAt`）。

## DELETE /sessions/:sessionId

从历史中移除一条记录。
