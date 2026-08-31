# ADR: Health 端点——`/api/health`、无鉴权、SQLite 轻量探针、503 降级

## Status

Accepted.

## Context

见 `docs/prd/health-endpoint.md`。要点：

- 部署侧需要一个稳定、无鉴权的探针路径，回答「实例活着且能服务」。
- 现有 `/api/admin/session` 返回初始化与登录态，语义是面板状态而非存活探针，且耦合登录概念。
- Shukka 是单实例，元数据在 SQLite（`data/` 目录），制品在 per-app S3。进程在跑但数据库打不开是「半死」状态，TCP 存活或登录页 200 探测会漏掉。
- 公开 API 文档（`/api/v1/openapi.json`）只展示 API key / session 可调与公开 feed/notes；session-only 管理路由不在其中。

## Decision

- **路径与鉴权**：`GET /api/health`，公开无鉴权。放在 `/api/` 前缀下与 `/api/admin`、`/api/v1`、`/api/update` 同层，独立于版本化的 `/api/v1`，因为它是实例级运维端点而非 app 契约。不进 `/api/v1/openapi.json`，与 session-only 管理路由同一处理（运维端点不进对外 API 文档）。
- **检查范围**：进程存活 + 一次 SQLite 轻量查询（`SELECT 1`）。不探 S3：S3 配置 per-app，无默认实例可探，强行探会假阳性（无 app 时永远「健康」）或假阴性（某 app 配置错），二者都偏离存活语义。
- **响应契约**：健康 `200 { status: "ok", db: "ok" }`；SQLite 抛错 `503 { status: "degraded", db: "down" }`。降级走 503 而非 500 错误信封 `{ error, message }`——health 是运维契约不是业务 API，固定形状便于编排器按状态码 / 字段判断，且避免把内部错误消息泄给无鉴权探针。
- **结构**：db 探针逻辑放 `src/server/health.ts`（域服务），路由 `src/routes/api/health.ts` 保持薄——只调用并组装响应，与仓库「路由薄、域逻辑在 `src/server/`」的分层一致。
- **不缓存**：响应 `cache-control: no-store`，探针每次都走真实 db，避免编排器拿到陈旧健康状态。

## Alternatives

- **`GET /health`（根路径）**：TanStack Start 文件路由下根路径与面板 SSR 入口耦合，且与未来静态资源路由冲突风险更高；放 `/api/` 前缀下与其它 server-only 路由同层更清晰，拒绝根路径。
- **`GET /api/v1/health`**：暗示它是版本化 app 契约的一部分并应进 OpenAPI 文档；health 是实例级运维端点，不属于 app API，拒绝版本化前缀。
- **只返回进程存活（200 {status:ok}）不探 db**：漏掉「进程在跑但 db 打不开」的半死状态，正是本端点要解决的问题，拒绝。
- **探 db + 探所有 app 的 S3**：S3 per-app，无 app 时无意义、有 app 时一次 health 要发起 N 次 S3 调用，延迟与失败语义都不可控；readiness 语义留给未来独立的 readiness 端点，拒绝塞进 liveness。
- **降级走 500 错误信封 `{ error, message }`**：health 是无鉴权运维契约，固定 `{ status, db }` 形状 + 503 状态码更易被编排器稳定解析，且不泄内部错误文本，拒绝复用业务错误信封。
- **进 OpenAPI 文档**：运维端点不属于「API key / session 可调的 app 操作或公开 feed」，与现有 session-only 管理路由处理一致，拒绝进文档。

## Trade-offs & failure bounds

- 探针每次 `SELECT 1`：本地 `file:` 上是一次轻量查询，可被高频探针调用而无显著开销；若编排器以亚秒级频率探，可由反向代理侧限频，不在应用内限流（避免引入可变状态）。
- 503 只表示「db 这一依赖此刻不可用」，不区分原因（锁死 / 磁盘满 / 损坏）；编排器按其策略重启或摘除，原因诊断留给日志。
- 不探 S3 意味着「db 健康」不等于「上传 / 下载全链路健康」；这是有意的范围切分，readiness 全链路探针留待未来需求。
- 无鉴权意味着端点存在性可被任意探测者发现；只暴露 `status` / `db` 两个布尔语义字段，不泄任何 app、版本、计数或配置信息。
