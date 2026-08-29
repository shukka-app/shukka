# ADR: 应用内 `/docs` ReDoc 已移除

> Superseded. In-app ReDoc (`/docs`) was removed; human API docs live in [shukka-app/docs](https://github.com/shukka-app/docs). The machine-readable contract remains `GET /api/v1/openapi.json`.

## Status

Superseded.

## Context

`/docs` 曾整页渲染当前服务器的 OpenAPI（无面板 chrome，会话认证后可见）。实现走过客户端 `RedocStandalone`、`@redocly/cli build-docs` + 正则内联 CDN bundle（失败：留下多个 `cdn.redocly.com` script），以及自建 HTML + cheerio 内联本地 `redoc` standalone bundle。人类文档已迁到独立仓库 `shukka-app/docs`，实例内再维护一份 HTML 渲染器只增加依赖（`redoc`、`cheerio`）与镜像体积（`require.resolve` 拷贝 bundle）。

## Decision

**移除应用内 ReDoc。** 删除 `/docs` 路由、`docs-html` 组装器、`redoc` / `cheerio` 依赖，以及镜像里对 redoc standalone bundle 的拷贝。人类文档指向 [`shukka-app/docs`](https://github.com/shukka-app/docs)。`GET /api/v1/openapi.json` 保留为机器可读契约（session）。面板 app 详情与 Integration 不再提供打开 `/docs` 的入口。

## Alternatives

- **保留 in-app ReDoc**：与 `shukka-app/docs` 重复，且继续拖着 ~1 MB bundle 与 cheerio 组装。拒绝。
- **换成其它 in-app OpenAPI 渲染器**：同样重复人类文档，不采用。
- **把 `openapi.json` 也删掉**：脚本与 agent 仍需要机器可读契约。保留。

## Trade-offs & failure bounds

- 已部署实例上 `/docs` 不再返回 ReDoc HTML（无路由 / 404 / 非 ReDoc 响应）。书签与旧链接失效。
- `GET /api/v1/openapi.json` 仍要 session；未登录 401。这是既有鉴权，不是本次变更。
- 运行镜像不再 `require.resolve('redoc/...')`，Alpine 阶段不再拷贝 redoc 文件。
