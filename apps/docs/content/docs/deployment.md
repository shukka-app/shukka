---
title: 自托管部署
description: 用 Docker 或源码把 Shukka 跑在一台带持久盘的单机上，配好反向代理、对象存储与备份。
---

Shukka 是单管理员的自托管服务：**一个 Node 进程 + 一块持久化数据卷 + 每个 app 自配的 S3 兼容存储**。SQLite 必须落在持久盘上；制品字节不经过 Shukka 进程（上传直传 S3，下载 302 跳转）。按无状态 / serverless 的习惯部署会丢掉数据库或加密密钥——请先读完本页。

## 推荐形态

一台 VPS（或同等单机）上跑仓库根 `Dockerfile` 构建的容器，挂一个持久卷到 `/data`，前面用 Caddy / nginx 终结 TLS。对象存储用 Cloudflare R2、AWS S3 或独立 MinIO。

## 用 Docker 部署（主路径）

1. 准备一台能跑 Docker 的 Linux 主机、一个域名、以及 S3 兼容存储（创建 app 时才用，不是启动前置）。
2. 在仓库根构建并运行（工作目录必须是应用根，迁移读 `./drizzle`）：

```bash
docker build -t shukka .
docker run -d --name shukka --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v shukka-data:/data \
  shukka
```

3. 反向代理到 `127.0.0.1:3000`，对外只暴露 HTTPS。
4. 打开面板，首次访问进入 setup，设置至少 8 位管理员密码。
5. 创建 app 并做 S3 写探测；探测失败不会落库。
6. 用下文「探活 / 冒烟」确认三类 HTTP 面都通。

README 里的 `ghcr.io/akarachen/shukka` 是预定镜像名；拉取失败时用上面的 `docker build` 自行构建。

## 从源码 + systemd

需要 Node 24（与 CI / `Dockerfile` 一致）和能编译 `better-sqlite3` 原生绑定的环境。

```bash
npm ci
npm run build
npm start          # node .output/server/index.mjs ，默认 :3000
```

进程的 cwd 必须是仓库根（或镜像 `WORKDIR /app`），否则启动时找不到 `./drizzle`，迁移不会跑。`npm run db:generate` 只在改了 `src/db/schema.ts` 之后由开发者执行，生产环境不要跑。

示例 unit（按主机改路径与用户）：

```ini
[Service]
WorkingDirectory=/opt/shukka
Environment=NODE_ENV=production
Environment=SHUKKA_DATA_DIR=/var/lib/shukka
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=on-failure
```

## 环境变量

进程只读这些变量。S3、管理员密码、API key **都不是**启动环境变量。

| 变量 | 默认 | 用途 |
|------|------|------|
| `PORT` 或 `NITRO_PORT` | `3000` | HTTP 端口（`NITRO_PORT` 优先） |
| `HOST` 或 `NITRO_HOST` | 未设（监听全部地址） | 绑定地址 |
| `SHUKKA_DATA_DIR` | `./data`（镜像内 `/data`） | SQLite 与加密密钥目录 |
| `SHUKKA_DB_PATH` | `{data}/shukka.db` | 覆盖数据库文件路径 |
| `SHUKKA_KEY_PATH` | `{data}/encryption.key` | 覆盖 S3 secret 的 AES 密钥文件 |
| `NODE_ENV` | 镜像内 `production` | Node 生产模式 |
| `NITRO_SSL_CERT` + `NITRO_SSL_KEY` | 未设 | 在 Node 进程上直接开 TLS（通常不如反代） |
| `NITRO_UNIX_SOCKET` | 未设 | 改走 UNIX socket |

`SHUKKA_URL`、`SHUKKA_SERVER_URL`、`SHUKKA_API_KEY`、`SHUKKA_APP` 等变量只被客户端 / CI / 测试脚本使用，**不是** Shukka 服务的配置。

## 反向代理与 TLS

- 面板、`/api/v1`、`/api/update` 同端口同进程。反代把整个 origin 转发到 Shukka，不要把路径拆到不同后端。
- 保留 `Host` 头。对外用 HTTPS。
- Session cookie 名 `shukka_session`：`HttpOnly`、`SameSite=Lax`、14 天；**没有** `Secure` 标志。
- 面板 Integration 页与 Tauri feed JSON 里的绝对 URL 来自 `request.url.origin`。Nitro node-server **默认不信任** `X-Forwarded-Proto`：TLS 终结在反代、回源是 HTTP 时，Shukka 看到的 origin 可能是 `http://…`。
  - Electron：yml 原文透传、制品文件名相对，把 `https://…/api/update/{app}/{channel}` 写进 electron-builder 即可，不受影响。
  - Tauri：`latest.json` 的 `url` 按本次请求的 origin 生成。`curl -sS https://your.host/api/update/{app}/{channel}` 若看到 `http://` 的制品 URL，让反代对后端也走 TLS，或给进程配 `NITRO_SSL_CERT` / `NITRO_SSL_KEY`。
- Tauri 生产客户端默认要求 HTTPS。
- 登录接口目前无限速。不要把 setup / login 裸露在无防护的公网而不做 TLS。

## 对象存储

每个 app 独立配置：endpoint、region、bucket、prefix、access key、secret、force path style。创建 / 保存前服务端会做写探测（Put + Delete 一个 `{prefix}/.shukka/probe/…` 探针对象），失败则拒绝保存。

| 厂商 | 要点 |
|------|------|
| AWS S3 | endpoint 留空；region 为真实区域 |
| Cloudflare R2 | endpoint 为 R2 S3 API；region `auto` |
| MinIO | 填 endpoint，强制 path-style |
| 其他兼容实现 | 按对方文档；多数要 path-style |

CI 与桌面客户端必须能访问该 endpoint（上传 PUT、下载跟 302）。Shukka 主机也必须能 Head/Get/Delete（finalize 与删版本时用）。Presigned URL 有效期 1 小时。

### 本机 MinIO（可选）

Shukka **不**随镜像带对象存储。需要自建 S3 时另起 MinIO，再在面板创建 app（MinIO：填 endpoint、勾 path-style；向导默认 region `us-east-1`）。GitHub Actions 必须能从公网打到该 endpoint——presigned PUT 由 CI 直传，不经过 Shukka。仓库没有 `docker-compose.yml`；需要时自行把 Shukka 容器与 MinIO 写在同一份 compose 里，Shukka 仍只挂自己的数据卷。

## 备份与升级

**备份边界是整个数据目录**（默认 `./data` / 容器内 `/data`）：`shukka.db`、WAL（`shukka.db-wal` / `shukka.db-shm`）、`encryption.key`。只拷数据库、丢掉密钥，就解不开已存的 S3 secret。

建议停写后拷整个目录，或：

```bash
sqlite3 /data/shukka.db ".backup /tmp/shukka-backup.db"
```

并同时复制 `encryption.key`。制品在各 app 的 bucket 里，单独做 bucket 版本或生命周期管理，不在数据目录里。

升级：拉新镜像或 `git pull && npm ci && npm run build`，停旧进程，用同一数据目录启动新进程。启动时若 cwd 下存在 `drizzle/` 会自动 migrate。同一数据目录不要同时跑两个 Shukka 进程。回滚：换回旧镜像 / 旧构建，保留数据目录；不要对生产库跑 `db:generate`。

## 探活 / 冒烟

没有独立的 `/health`。用未鉴权的 session 接口探测进程是否起来：

```bash
curl -sS "$SHUKKA_URL/api/admin/session"
# {"initialized":false,"authenticated":false}   首次
# {"initialized":true,"authenticated":false}    已设密未登录
```

设密并建 app 之后：

1. 未登录打开 `/apps` → 重定向到 `/login`（未初始化则 `/setup`）。
2. `GET /api/update/{app}/{channel}/latest.yml`（Electron）或 `GET /api/update/{app}/{channel}`（Tauri）：无已发布版本时 404；有则 200。
3. 已发布制品：`curl -sSI "$SHUKKA_URL/api/update/{app}/{channel}/{filename}"` → 302。
4. 创建 app 时面板「测试连接」成功，或 `POST /api/admin/storage/test` 返回 `{ ok: true }`。

## 忘记密码

没有邮箱找回。停掉写入后打开数据目录里的 SQLite，删掉管理员行与 session，重启后重走 setup：

```bash
sqlite3 /var/lib/shukka/shukka.db "DELETE FROM admin; DELETE FROM sessions;"
```

Docker 卷里默认在 `/data/shukka.db`。删的是密码与登录态，app / channel / 版本记录还在。

## 其他托管形态

| 形态 | 结论 |
|------|------|
| 单机 systemd | 可行，等价于主路径减去容器 |
| Compose：Shukka + 可选 MinIO | 可行；compose 需自写，MinIO 要对 CI / 客户端可达 |
| Fly.io / Railway / Render 等带持久盘的单实例 PaaS | 可以，必须挂持久卷到 `SHUKKA_DATA_DIR`，**副本数 = 1** |
| 多副本 / 滚动两实例共用一块 SQLite | 不要 |
| Vercel / Netlify / Cloudflare Workers / 无盘 Lambda | 不适合：文件系统短暂、`better-sqlite3` 原生绑定、SQLite 单写者 |

## 常见失败

| 现象 | 原因与处理 |
|------|------------|
| 重启后回到 setup | 数据卷没挂上，或 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` 指向空目录 |
| 能登录但改 / 建 app 报 storage 错 | 只恢复了 `.db`，没有同目录的 `encryption.key` |
| 启动后表结构旧 | 进程 cwd 下没有 `drizzle/`（没从应用根启动，或镜像没 `COPY drizzle`） |
| 创建 app 报 `storage_error` | 凭证、bucket、endpoint、path-style 配置错，或 Shukka 主机到 S3 不通 |
| CI finalize 成功但客户端下不下来 | 客户端到 S3 不通；或 Tauri feed 里的 `url` 是 `http://`（见 TLS 节） |
| 登录成功但 cookie 没带上 | 面板 origin 与 API origin 不一致（反代拆了主机名） |
| 升级后数据没了 | 新容器没挂原来的卷 |
