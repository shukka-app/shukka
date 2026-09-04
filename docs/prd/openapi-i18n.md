# PRD: OpenAPI 文档中英双语

**Status: shipped.**

## Problem

文档站已按 `zh-CN` / `en-US` 分语言，Scalar 的 UI chrome 也随语言切换，但 `public/openapi.json` 只有一份英文叙事（info、tag、summary、description）。中文读者在 `/zh-CN/api` 看到的仍是英文接口说明。

## Users

- **中文读者**：在文档站中文 API 参考里阅读与站点其余页面一致的中文接口说明。
- **英文读者**：继续阅读现有英文 OpenAPI。
- **脚本 / agent**：仍消费实例上的英文机器可读契约 `GET /api/v1/openapi.json`。

## Goals

1. OpenAPI **叙事文案**（info、tag 名与说明、operation summary/description、response description）可生成 English 与简体中文两份。
2. 文档站 `/[lang]/api` 按当前语言加载对应快照：`en-US` → `openapi.json`，`zh-CN` → `openapi.zh-CN.json`。
3. 路径、方法、参数名、JSON Schema、错误码、安全方案名保持语言无关，两份文档的操作集合一致。
4. 实例上的 `GET /api/v1/openapi.json` 仍返回英文机器可读契约（session），调用方无需改。

## Non-goals

- 实例端点按 `Accept-Language` 或 `?locale=` 返回中文 OpenAPI。
- 翻译 Zod / JSON Schema 字段 description（机器契约保持英文）。
- 第三种语言。
- 恢复应用内 OpenAPI HTML 渲染器。

## Flows

### 读者：在文档站切换语言

1. 打开 `/zh-CN/api`：Scalar 加载 `openapi.zh-CN.json`，接口说明为简体中文。
2. 切换到 `/en-US/api`：Scalar 加载 `openapi.json`，接口说明为英文。
3. 两份文档的路径与请求/响应形状相同。

### 开发者：主仓库 API 变更后更新快照

1. 在文档站仓库运行 `npm run sync:openapi`。
2. 脚本从主仓库 `openApiDocument(origin, locale)` 写出英文与中文两份静态 JSON。

## Acceptance criteria

- [x] `openApiDocument(origin)` 与 `openApiDocument(origin, 'en')` 的叙事为英文；`openApiDocument(origin, 'zh')` 的 info/tag/summary/description 含中文。
- [x] 两份文档的 path 键与 HTTP 方法集合相同。
- [x] 文档站中文 API 页请求 `/openapi.zh-CN.json`，英文页请求 `/openapi.json`。
- [x] `GET /api/v1/openapi.json` 仍为 session、英文、`cache-control: no-store`。
- [x] 中英文字典键编译期对齐（缺键即类型错误）。
