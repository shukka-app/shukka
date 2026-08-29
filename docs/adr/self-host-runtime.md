# ADR: 单进程 Node + 持久化数据卷

## Status

Accepted.

## Context

Shukka 是面板 + 上传 API + 更新 feed 的同一个 TanStack Start / Nitro Node 进程（[tanstack-start-fullstack](tanstack-start-fullstack.md)）。元数据在 SQLite，S3 secret 的加密密钥与数据库同目录（[metadata-sqlite-drizzle](metadata-sqlite-drizzle.md)、[per-app-s3-and-secrets](per-app-s3-and-secrets.md)）。制品不经过本进程。运维能力假设为「一个容器 + 一个卷」。需要明确**推荐怎么发这个进程**，以及哪些托管形态与上述约束冲突。

## Decision

1. **一个 Node 进程**跑 `node .output/server/index.mjs`（`npm start`）。不拆面板/API/feed，不做多副本抢同一 SQLite 文件。
2. **一块持久盘**挂到 `SHUKKA_DATA_DIR`（镜像默认 `/data`）。目录内是完整备份边界：`shukka.db`（WAL）、`encryption.key`。
3. **推荐分发**：仓库根 `Dockerfile`——Debian 构建阶段装编译链后 `npm ci` + `vite build`（Nitro 把 `better-sqlite3` 官方 prebuild 追进 `.output/`），Alpine 运行阶段只拷贝 `.output/` 和 `drizzle/`。不在运行镜像里再装一份生产 `node_modules`。启动时自动 migrate。
4. **对象存储在进程外**，按 app 在面板配置。镜像不捆绑 MinIO。
5. TLS 默认由反代终结；进程也可读 Nitro 的 `NITRO_SSL_*`，但不作为主路径。

## Alternatives

- **源码 + systemd**：与 Docker 等价，少一层镜像；运维要自己管 Node 24 与原生模块。作为并列可行路径写进 PRD，不替代推荐分发。
- **Fly.io / Railway / Render 等带卷的单实例 PaaS**：可以，前提是持久卷 + 单机。比 VPS 多一层平台抽象，卷丢失或多机器调度会踩 SQLite。
- **Serverless / 无盘（Vercel、Workers、无 EFS 的 Lambda）**：文件系统短暂，SQLite 与加密密钥无法可靠存活；`better-sqlite3` 也不适合这些运行时。排除。
- **Postgres 换掉 SQLite**：能上多实例，但违背「一个容器 + 一个卷」的自托管假设，另开决策。
- **全局 S3 环境变量、不要数据目录**：上传能工作，但 session、版本记录、计数、加密密钥仍要落盘；省不掉卷。

## Trade-offs & failure bounds

- 单机单进程：宕机期间 feed 不可用，已装客户端不受影响（[update-feed-proxy](update-feed-proxy.md)）。可用性靠主机与反代，不靠水平扩展。
- 数据目录丢失 = 丢版本记录、API key、session，以及解密 S3 secret 的能力；bucket 里的制品还在但面板对不上。
- 两实例写同一 SQLite 会损坏数据库。PaaS 必须锁副本数为 1。
- `request.url.origin` 用于 Integration 文案与 Tauri feed 绝对 URL。Nitro node-server 默认不信任 `X-Forwarded-Proto`；反代 HTTP 回源时 Tauri 制品 URL 可能变成 `http://`。规避见 `docs/prd/deploy.md`，不在本 ADR 发明新环境变量。
- 推荐分发是 `ghcr.io/shukka-app/shukka`（semver 标签发布，见 `docs/adr/ghcr-on-semver-tag.md`）。源码构建入口仍是根 `Dockerfile`。
