# PRD: 程序化 App API——key 覆盖 app 内能力

## Problem

API key 只能 init/finalize 上传。面板能做的设 current、建 channel、写 notes、改 app 设置、删版本，key 都调不了；也没有一份给调用方看的 OpenAPI。数字 id 出现在 URL 里，不便复制，也不便和 feed 的 slug/channel 对齐。

## Users

- **CI / agent / 脚本（API key）**：操作其绑定的那一个 app。
- **管理员（session）**：同一棵 app 资源树，外加实例级操作与 key 生命周期。
- **开发者**：对照人类文档（[`shukka-app/docs`](https://github.com/shukka-app/docs)）与机器可读契约（`GET /api/v1/openapi.json`）。

## Goals

1. 单一资源树：`/api/v1/apps/{appSlug}/...`，session cookie 与 Bearer API key 都能打（鉴权工具函数分流）。
2. 对外标识只用自然键：app `slug`、channel `name`、version 字符串。HTTP 与面板路由（`/apps/{appSlug}`、notes 页用 version 字符串）不再暴露数字 id。
3. Channel `name` 为 URL token：小写字母、数字、连字符、下划线，不能是任意文本（与 slug 同族，另允许 `_`；不再允许 `.`）。
4. API key 能做绑定 app 内、面板能点的写/读：**改该 app 设置**、channel / version / note 的 CRUD、设 current、读详情与趋势、按版本+文件名领取制品 presigned GET。
5. API key **不能**：建/列全部 app、删整个 app、改管理员密码、签发/吊销/删除 API key（key 只在面板管理）。
6. 实例级（登录、改密、列/建 app、存储探测）仍走 session 专用路由，不进 key 的能力面。
7. 人类 API 文档在 [`shukka-app/docs`](https://github.com/shukka-app/docs)，不在面板内嵌 HTML 渲染器。机器可读契约为 `GET /api/v1/openapi.json`（session）。

## Non-goals

- 多租户、key 跨 app。
- UUID 对外标识。
- 把 session 管理或改密暴露给 API key。
- 未登录可打开的 API 浏览器。
- 实例内 ReDoc / 其它 OpenAPI HTML 渲染器。

## Flows

### 脚本：promote 一个 draft

1. `Authorization: Bearer shk_...`
2. `PATCH /api/v1/apps/{slug}/channels/{channel}` body `{ "currentVersion": "1.4.2" }`
3. 若该 version 是 draft，写入 `releasedAt` 并切 current。

### 开发者：对照文档

1. 人类可读说明在 [`shukka-app/docs`](https://github.com/shukka-app/docs)。
2. 需要本实例的机器可读契约时，带 session 请求 `GET /api/v1/openapi.json`。
3. 文档只展示 API key（或 session）可调用的操作与公开 feed/notes；session-only 管理操作（删 app、API key 生命周期、实例级路由）不在公开 API 文档中。

## Acceptance criteria

- [x] 面板原先走 `/api/admin/apps/:id/...` 的 app 内操作，均可经 `/api/v1/apps/{slug}/...` 用 session 完成。
- [x] 同一组 app 内读写（除 key 管理与删 app）可用该 app 的 API key 完成。
- [x] 用 key 调删 app、管 key、列/建其它 app、改密 → 401/403。
- [x] 路径与面板深链只用 slug / channel 名 / version 字符串。
- [x] 非法 channel 名（含大写、空格、`.` 等）创建失败。
- [x] 面板无 `/docs` ReDoc 入口；人类文档指向 [`shukka-app/docs`](https://github.com/shukka-app/docs)。
- [x] `GET /api/v1/openapi.json` 仍为 session 可取的机器可读契约。

## Resolved product decisions

- Key 范围只在绑定 app 内，最多改设置 + CRUD 内部实体。
- Key 生命周期只留面板。
- 应用内 ReDoc（`/docs`）已移除；人类文档在 `shukka-app/docs`，机器可读契约保留 `GET /api/v1/openapi.json`。
- 程序化 API 与面板 admin 调用合并为一棵 apps 树，分叉主要是鉴权。
- 不上 UUID。
