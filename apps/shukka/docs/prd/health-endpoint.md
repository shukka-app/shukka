# PRD: Health 端点——进程与数据库存活探针

## Problem

Shukka 是自托管单实例：SQLite 在本地 `data/` 目录，制品在每 app 自配的 S3。部署侧（容器编排、反向代理、运维脚本）目前没有一个稳定、无鉴权的探针来回答「这个实例活着吗、能服务吗」。`/api/admin/session` 是面板用的、返回初始化与登录态的端点，语义不是存活探针，且耦合了登录概念。缺少 health 探针时，编排器只能用 TCP 端口存活或登录页 200 来判断健康，会漏掉「进程在跑但数据库打不开」这类半死状态。

## Users

- **部署侧**：容器编排（liveness/readiness probe）、反向代理（被动健康检查）、运维脚本与监控。无人类终端用户。

## Goals

1. 提供一个稳定、无鉴权的 `GET /api/health`，供部署侧探针使用。
2. 探针在进程存活的基础上，顺带探一下 SQLite：执行一次轻量查询，能成功才视为健康。
3. 健康时返回 `200` 与 `{ status: "ok", db: "ok" }`；数据库不可达时返回 `503` 与 `{ status: "degraded", db: "down" }`，不抛 500 信封。
4. 响应不依赖任何 app、channel、登录态或 S3 配置；不进入公开 API 文档（与 session-only 管理路由同一处理）。

## Non-goals

- 探 S3：S3 配置 per-app 且无默认实例可探， readiness 语义会假阳性；不在 health 范围。
- 探 admin 初始化态、登录态、app 数量等业务状态。
- 鉴权、限流、缓存头策略（探针路径保持极简，不引入额外可变状态）。
- Prometheus `/metrics`、结构化健康子状态聚合（subsystem 报告）等扩展面。

## Flows

### 编排器 liveness/readiness 探针

1. 编排器周期性 `GET /api/health`。
2. 进程在跑且 SQLite 查询成功 → `200 { status: "ok", db: "ok" }`，编排器视为健康。
3. SQLite 抛错（文件锁死、磁盘满、迁移损坏等） → `503 { status: "degraded", db: "down" }`，编排器按其策略重启或摘除流量。

## Acceptance criteria

- [ ] `GET /api/health` 无鉴权、不依赖任何 cookie 或 bearer，未初始化实例也返回 200。
- [ ] 健康时响应 `200`，体为 `{ status: "ok", db: "ok" }`。
- [ ] SQLite 查询抛错时响应 `503`，体为 `{ status: "degraded", db: "down" }`，不返回 500 错误信封。
- [ ] 端点不在 `/api/v1/openapi.json` 公开文档中（与 session-only 管理路由一致）。
- [ ] 端点不依赖任何 app / channel / version 数据存在。
