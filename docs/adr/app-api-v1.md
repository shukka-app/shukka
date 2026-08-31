# ADR: 统一 `/api/v1/apps/{slug}` + 鉴权工具函数；自然键

## Context

上传已在 `/api/v1`，面板在 `/api/admin/apps/:numericId`。要让 API key 覆盖 app 内能力并给出 OpenAPI，继续维持两棵树会双份路由。数字 id 不适合复制，也不对齐 feed。

## Decision

1. **一棵 app 资源树**：`/api/v1/apps/{appSlug}/channels/{channelName}/...`、`.../versions/{version}`、notes、趋势、PATCH 设置。面板前端改打这棵树。
2. **鉴权**：抽出 `requireSession`、`authenticateApiKey`、`requireAppActor(request, slug)`（session 可操作该 slug；key 必须绑定该 slug）。Handler 内再拒绝 key 的删 app / 管 key。
3. **实例级仍分离**（仅 session）：setup / login / logout / session / password、列与创建 app、存储探测、该 app 的 API key CRUD。
4. **对外标识**：slug、channel name、version 字符串。表内整数 PK 仅作 FK。面板路由改为 `/apps/{appSlug}`。
5. **Channel name**：`^[a-z0-9][a-z0-9_-]{0,62}$`（收紧既有规则：去掉 `.`，保留数字与 `_`）。非法名 `invalid_request`。
6. **OpenAPI** 描述 v1 契约中 API key（或 session）可调用的操作，以及公开 feed/notes；session-only 管理操作（删 app、API key 生命周期、实例级路由）不在公开 API 文档中。机器可读契约为 `GET /api/v1/openapi.json`（session）。人类文档在 [`shukka-app/docs`](https://github.com/shukka-app/docs)。应用内不再提供 HTML 渲染器（见已 superseded 的 `docs/adr/docs-renderer.md`）。

## Alternatives

- **`/api/admin` 兼收 Bearer**：文档混进 cookie 与数字 id，拒绝。
- **对外 UUID**：改名更稳，但 channel 不能改名、version 不可变，额外列无收益，拒绝。

## Revisited 2026-08

A leaked app-scoped API key must not steer server-originated signed S3 probes or silently repoint artifact storage. PATCH of `slug` and storage-identity fields (`s3Endpoint`, `s3Region`, `s3Bucket`, `s3Prefix`, `s3AccessKeyId`, `s3SecretAccessKey`, `s3ForcePathStyle`) is session-only; keys may still change `name`, and resubmitting unchanged values is not a modification. Independently, changing endpoint/bucket/prefix while artifacts exist probes the newest stored key against the **new** settings and refuses the save if it is missing.

## Trade-offs & failure bounds

- 改 app slug 后旧 `/apps/{old}` 与旧 API 路径 404；调用方需用新 slug。
- Key 与 session 打同一 URL，授权矩阵必须单测，避免 key 摸到管 key / 删 app。
- OpenAPI 与实现漂移由测试（契约或路由表）兜住，不另做代码生成框架（实现期可选用 zod → OpenAPI）。
