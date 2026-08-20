---
title: 自托管部署
description: 用 Docker 或源码把 Shukka 跑在一台带持久盘的单机上，配好反向代理、对象存储与备份。
---

Shukka 是单管理员的自托管服务。服务自身的数据库与加密密钥存放在运行机器的磁盘上；安装包存放于每个应用各自配置的 S3 兼容存储。

## 推荐形态

一台 VPS（或同等单机）上跑公开镜像 `ghcr.io/shukka-app/shukka`，挂一个持久卷到 `/data`，前面用 Caddy 或 nginx 提供 HTTPS。对象存储用 Cloudflare R2、AWS S3 或独立 MinIO。

## 用 Docker 部署（主路径）

1. 准备一台能跑 Docker 的 Linux 主机、一个域名、以及 S3 兼容存储。
2. 拉取公开镜像并运行：

```bash
docker run -d --name shukka --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v shukka-data:/data \
  ghcr.io/shukka-app/shukka
```

镜像在 [GitHub Packages](https://github.com/shukka-app/shukka/pkgs/container/shukka)，无需登录即可拉取。推送 semver 标签（`vMAJOR.MINOR.PATCH`）会由 GitHub Actions 构建并发布；未加 tag 时拉的是 `latest`。钉版本用 `ghcr.io/shukka-app/shukka:0.1.0`。要从源码自行构建时，在仓库根执行 `docker build -t shukka .`，把上面的镜像名换成 `shukka`。

3. 反向代理到 `127.0.0.1:3000`，对外只暴露 HTTPS。
4. 打开面板，首次访问进入 setup，设置至少 8 位管理员密码。
5. 创建应用时测试存储连接；测试失败不会保存。
6. 用下文「探活 / 冒烟」确认服务正常。

## 从源码 + systemd

需要 Node 24（与 CI / `Dockerfile` 一致）和能编译原生 Node 模块的环境。

```bash
npm ci
npm run build
npm start          # node .output/server/index.mjs ，默认 :3000
```

进程必须在仓库根启动，否则启动时不会执行数据库迁移。生产环境不要运行 `npm run db:generate`。

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

## 反向代理与 TLS

- 面板、`/api/v1`、`/api/update` 同端口同进程。反代把整个 origin 转发到 Shukka，不要把路径拆到不同后端。
- 保留 `Host` 头。对外用 HTTPS。
- 已知坑：反代做 HTTPS、回源是 HTTP 时，Tauri feed 里的制品 URL 可能是 `http://`。用 `curl -sS https://your.host/api/update/{app}/{channel}` 验证；若看到 `http://`，让反代对后端也走 TLS，或给进程配 `NITRO_SSL_CERT` / `NITRO_SSL_KEY`。

## 对象存储

每个 app 独立配置：endpoint、region、bucket、prefix、access key、secret、force path style。创建 / 保存前服务端会做一次写测试，失败则拒绝保存。

| 厂商 | 要点 |
|------|------|
| AWS S3 | endpoint 留空；region 为真实区域 |
| Cloudflare R2 | endpoint 为 R2 S3 API；region `auto` |
| MinIO | 填 endpoint，强制 path-style |
| 其他兼容实现 | 按对方文档；多数要 path-style |

CI 与桌面客户端必须能访问该 endpoint（上传 PUT、下载跟 302）。Shukka 主机也必须能 Head/Get/Delete（finalize 与删版本时用）。Presigned URL 有效期 1 小时。

### 本机 MinIO（可选）

Shukka **不**随镜像带对象存储。需要自建 S3 时另起 MinIO，再在面板创建 app（MinIO：填 endpoint、勾 path-style；向导默认 region `us-east-1`）。GitHub Actions 必须能从公网打到该 endpoint——上传由 CI 直传，不经过 Shukka。仓库没有 `docker-compose.yml`；需要时自行把 Shukka 容器与 MinIO 写在同一份 compose 里，Shukka 仍只挂自己的数据卷。

## 备份与升级

**备份边界是整个数据目录**（默认 `./data` / 容器内 `/data`）：`shukka.db`、WAL（`shukka.db-wal` / `shukka.db-shm`）、`encryption.key`。只拷数据库、丢掉密钥，就解不开已存的 S3 secret。

建议停写后拷整个目录，或：

```bash
sqlite3 /data/shukka.db ".backup /tmp/shukka-backup.db"
```

并同时复制 `encryption.key`。制品在各 app 的 bucket 里，单独做 bucket 版本或生命周期管理，不在数据目录里。

升级：拉新镜像或 `git pull && npm ci && npm run build`，停旧进程，用同一数据目录启动新进程。启动时会自动执行数据库迁移。同一数据目录不要同时跑两个 Shukka 进程。回滚：换回旧镜像 / 旧构建，保留数据目录。

## 探活 / 冒烟

进程探活用未鉴权的 health 接口：

```bash
curl -sS "$SHUKKA_URL/api/health"
# {"status":"ok","db":"ok"}            正常
# {"status":"degraded","db":"down"}    进程在但数据库不可用（HTTP 503）
```

## 忘记密码

没有邮箱找回。停掉写入后打开数据目录里的 SQLite，删掉管理员行与 session，重启后重走 setup：

```bash
sqlite3 /var/lib/shukka/shukka.db "DELETE FROM admin; DELETE FROM sessions;"
```

Docker 卷里默认在 `/data/shukka.db`。删的是密码与登录态，app / channel / 版本记录还在。

## 常见失败

| 现象 | 原因与处理 |
|------|------------|
| 重启后回到 setup | 数据卷没挂上，或 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` 指向空目录 |
| 能登录但改 / 建 app 报 storage 错 | 只恢复了 `.db`，没有同目录的 `encryption.key` |
| 启动后表结构旧 | 进程未从应用根启动，数据库迁移未执行 |
| 创建 app 报 `storage_error` | 凭证、bucket、endpoint、path-style 配置错，或 Shukka 主机到 S3 不通 |
| CI finalize 成功但客户端下不下来 | 客户端到 S3 不通；或 Tauri feed 里的 `url` 是 `http://`（见 TLS 节） |
| 登录成功但 cookie 没带上 | 面板 origin 与 API origin 不一致（反代拆了主机名） |
| 升级后数据没了 | 新容器没挂原来的卷 |
