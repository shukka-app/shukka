# PRD: 双运行时（Node 自托管 + Cloudflare Worker 全面板）

## Problem

自托管仍是单进程 Node + 数据卷。同时要把同一份面板跑上 Cloudflare Workers：setup / 登录 / apps / channels / notes / integration / 上传 API / feed，不是一份更小的 edge-only UI。

## Users

- **运维**：继续用 Docker / VPS，行为除预备 issue 外不变。
- **运维（Worker）**：用远程 SQLite（Turso / 兼容 HTTP）+ 环境变量密钥，在 Workers 上跑同一面板。

## Goals

1. Worker 部署是**同一份**面板与 API，没有第二套 UI、没有 feed-only 裁剪。
2. Node `npm run build` / `npm start` / Docker 保持现有 Nitro 产物。
3. Worker 用 TanStack / Cloudflare 官方插件另打一次：`npm run build:worker` + `wrangler deploy`。
4. Worker 上不记 feed 命中、不跑进程内登录限速（已由 #46 / #52 保证）。
5. Worker 必须设 `SHUKKA_ENCRYPTION_KEY` 与 `SHUKKA_DB_URL`；首次 setup 应设 `SHUKKA_PASSWORD_HASH=pbkdf2`。
6. 不在 isolate 内 `migrate('./drizzle')`；schema 用 Turso CLI 或等价路径施加。

## Non-goals

- 丢掉 Docker / GHCR。
- Postgres。
- 自动把已有 `scrypt$` 转成 `pbkdf2$`。
- 在本仓库写完 [shukka-app/docs](https://github.com/shukka-app/docs) 的安装页（那边跟进）。

## Flows

### 运维：Docker / VPS

与今天相同：`npm run build && npm start` 或 GHCR 镜像 + `/data` 卷。

### 运维：Cloudflare Worker

1. 准备远程 libsql（Turso 或兼容 HTTP）并施加 `drizzle/` 迁移。
2. `wrangler secret put SHUKKA_ENCRYPTION_KEY`、`SHUKKA_DB_URL`（及可选 `SHUKKA_DB_AUTH_TOKEN`）。
3. 尚未初始化时设 `SHUKKA_PASSWORD_HASH=pbkdf2`。
4. `npm run deploy:worker`。
5. 打开 Worker URL，走同一 setup → 登录 → 建 app → 发版 → feed 302。

## Acceptance criteria

- [x] Node 构建与启动命令不变。
- [x] Worker 入口在加载应用图之前把 bindings 抄到 `process.env`。
- [x] 云 isolate 上缺 `SHUKKA_ENCRYPTION_KEY` 拒绝启动；filepath 不受支持。
- [x] 文档写明双运行时、Worker 必填变量、以及命中/限速差异。
- [ ] 真实 Worker 上走完 setup → 发版 → feed（需账号与远程库；本环境只验证 Worker 构建）。
- [x] Worker 脚本 gzip（`wrangler deploy --dry-run` 的 Total Upload gzip）不超过 Cloudflare Free 的 3 MiB；CI `worker-size` 卡住超限。

## Exclusions and resolved product decisions

- 同一份面板，不是 feed-only。
- 检测与限速/命中共用 `isCloudFunction()`。
- 用户向安装文案在 shukka-app/docs 跟进。
