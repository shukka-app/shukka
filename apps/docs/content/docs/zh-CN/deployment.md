---
title: 自托管部署
description: 用 Docker 或源码把 Shukka 跑在一台带持久盘的单机上，配好反向代理、对象存储与备份，再对外提供 HTTPS。
---

Shukka 是单管理员的自托管服务。这条路径上，服务自身的数据库以及（默认的）加密密钥存放在运行机器的磁盘上；安装包存放于每个应用各自配置的 S3 兼容存储。

不想自己挂机器时见 [Cloudflare Workers](/zh-CN/docs/cloudflare)。

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

镜像在 [GitHub Packages](https://github.com/shukka-app/shukka/pkgs/container/shukka)，无需登录即可拉取。推送 semver 标签（`vMAJOR.MINOR.PATCH`）会由 GitHub Actions 构建并发布；未加 tag 时拉的是 `latest`。钉版本用 `ghcr.io/shukka-app/shukka:0.1.0`。要从源码自行构建时，在仓库根执行 `docker build -t shukka -f apps/shukka/Dockerfile .`，把上面的镜像名换成 `shukka`。

同一份编排在 [`apps/shukka/deploy/compose.yaml`](https://github.com/shukka-app/shukka/blob/main/apps/shukka/deploy/compose.yaml)（Shukka + 示例 MinIO）。钉版本用 `SHUKKA_IMAGE`：

```bash
docker compose -f apps/shukka/deploy/compose.yaml up -d
docker exec minio mkdir -p /data/releases
```

Ansible 把该文件拷到主机并等到 `/api/health`：[`apps/shukka/deploy/ansible/playbook.yml`](https://github.com/shukka-app/shukka/blob/main/apps/shukka/deploy/ansible/playbook.yml)。Docker Compose v2 是前置条件。

```bash
ansible-playbook -i inventory.ini apps/shukka/deploy/ansible/playbook.yml
```

同一份镜像也可以用 [Kamal](/zh-CN/docs/kamal) 部到主机（`kamal setup` 装 Docker 与 kamal-proxy，之后 `kamal deploy` 拉镜像换容器）。

3. 反向代理到 `127.0.0.1:3000`，对外只暴露 HTTPS。
4. 打开面板，首次访问进入 setup，设置至少 8 位管理员密码。除非已经确定这个实例以后要上 Cloudflare Workers Free，否则不要设 `SHUKKA_PASSWORD_HASH`（或设 `scrypt`）——算法在首次 setup 锁定。见下文「口令哈希」。
5. 创建应用时测试存储连接；测试失败不会保存。
6. 用下文「探活 / 冒烟」确认服务正常。

## 从源码 + systemd

需要 Node 24（与 CI / `Dockerfile` 一致）。

```bash
ni                         # 仓库根 pnpm workspace
nr --filter shukka build
nr --filter shukka start   # node .output/server/index.mjs ，默认 :3000
```

进程必须在 `apps/shukka` 启动（镜像 `WORKDIR /app`），否则启动时不会执行数据库迁移。生产环境不要运行 `nr --filter shukka db:generate`。

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

进程只读这些变量。S3、管理员密码、API key **都不是**启动环境变量。`SHUKKA_PASSWORD_HASH` 只在实例**尚未初始化**的首次 setup 读取，之后忽略。

| 变量 | 默认 | 用途 |
|------|------|------|
| `PORT` 或 `NITRO_PORT` | `3000` | HTTP 端口（`NITRO_PORT` 优先） |
| `HOST` 或 `NITRO_HOST` | 未设（监听全部地址） | 绑定地址 |
| `SHUKKA_DATA_DIR` | `./data`（镜像内 `/data`） | SQLite 目录；两个密钥变量都未设时，也是 `encryption.key` 的自动生成位置 |
| `SHUKKA_DB_PATH` | `{data}/shukka.db` | 覆盖数据库文件路径 |
| `SHUKKA_ENCRYPTION_KEY_FILEPATH` | 未设 | 从该文件读取 S3 secret 的 AES 密钥（64 位 hex，32 字节）。设置后不自动生成；路径不在数据目录时不写 `./data` |
| `SHUKKA_ENCRYPTION_KEY` | 未设 | 直接提供同一格式的密钥。设置后不写密钥文件 |
| `SHUKKA_KEY_PATH` | 未设 | **已弃用**，等同 `SHUKKA_ENCRYPTION_KEY_FILEPATH`，保留一个版本。与 FILEPATH 设成不同路径、或与 VALUE 同时出现则拒绝启动 |
| `SHUKKA_PASSWORD_HASH` | 未设（`scrypt`） | 仅首次 setup 选用管理员口令哈希：未设或 `scrypt` → `scrypt$…`；`pbkdf2` → `pbkdf2$…`。初始化之后锁定。其它值（含 `argon2`）使 setup 返回 `invalid_request` |
| `SHUKKA_TRUST_PROXY` | 未设 | 设 `1` 或 `true` 时采信反代追加的 `X-Forwarded-For`（最右一跳）与 `X-Real-IP` 作为登录限速键；未设则忽略这些头 |
| `SHUKKA_SECURE_COOKIES` | 未设 | 设 `1` 或 `true` 时强制 session cookie 带 `Secure`。HTTPS 请求（或 `X-Forwarded-Proto: https`）也会带 `Secure` |
| `SHUKKA_DB_URL` | 未设 | 远程 libsql HTTP URL。**仅 Workers** —— Docker / VPS 不读 |
| `SHUKKA_DB_AUTH_TOKEN` | 未设 | 该远程库的可选 token。**仅 Workers** |
| `NODE_ENV` | 镜像内 `production` | Node 生产模式 |
| `NITRO_SSL_CERT` + `NITRO_SSL_KEY` | 未设 | 在 Node 进程上直接开 TLS（通常不如反代） |
| `NITRO_UNIX_SOCKET` | 未设 | 改走 UNIX socket |

`SHUKKA_ENCRYPTION_KEY` 与 `SHUKKA_ENCRYPTION_KEY_FILEPATH` **只能设其中一个**。都未设则首次启动在 `{SHUKKA_DATA_DIR}/encryption.key` 生成密钥。空值或不是 64 位 hex 拒绝启动。

Cloudflare Workers 上只接受 `SHUKKA_ENCRYPTION_KEY`。见 [Cloudflare Workers](/zh-CN/docs/cloudflare)。

### 口令哈希

`SHUKKA_PASSWORD_HASH` 在首次 setup **锁定**：

- 未设或 `scrypt` —— 默认。VPS / Docker / Cloudflare Paid 用这个。
- `pbkdf2` —— 更弱的 KDF，能跑进 Cloudflare Workers Free 的 CPU。若目标是这条运行时，必须在创建管理员密码**之前**选定。

已经写入的 `scrypt$` 不会因为后来改成 `pbkdf2` 而转换。要把已有实例迁到只适合 pbkdf2 的运行时，删除 `admin` 与 `sessions`（与忘记密码同一条路），设 `SHUKKA_PASSWORD_HASH=pbkdf2`，再走 setup。

手改 `admin.password_hash` 不受支持。库存值以 `scrypt$` 或 `pbkdf2$` 开头，进程按此前缀校验。自己改这一行可能把自己锁在外面，或把 `scrypt$` 实例放到 Cloudflare Free 上（登录可能超过 CPU 配额）。

## 反向代理与 TLS

- 面板、`/api/v1`、`/api/update` 同端口同进程。反代把整个 origin 转发到 Shukka，不要把路径拆到不同后端。
- 保留 `Host` 头。对外用 HTTPS。
- 反代后面部署时设 `SHUKKA_TRUST_PROXY=1`，登录限速（Node 上同一 IP 15 分钟 10 次失败）才会用客户端地址而不是代理。Cloudflare Workers 不跑这份进程内限速，防爆破靠平台 WAF。

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

Shukka **不**随镜像带对象存储。需要自建 S3 时用 [`apps/shukka/deploy/compose.yaml`](https://github.com/shukka-app/shukka/blob/main/apps/shukka/deploy/compose.yaml) 里的 MinIO，或另起一个，再在面板创建 app（MinIO：填 endpoint、勾 path-style；向导默认 region `us-east-1`）。GitHub Actions 必须能从公网打到该 endpoint——上传由 CI 直传，不经过 Shukka。Shukka 仍只挂自己的数据卷。

## 备份与升级

**默认与 filepath 模式：**备份边界是整个数据目录（默认 `./data` / 容器内 `/data`）：`shukka.db`、WAL（`shukka.db-wal` / `shukka.db-shm`）、以及 `encryption.key`（或 `SHUKKA_ENCRYPTION_KEY_FILEPATH` / `SHUKKA_KEY_PATH` 指向的文件）。只拷数据库、丢掉密钥，就解不开已存的 S3 secret。

**`SHUKKA_ENCRYPTION_KEY` 模式：**备份是数据库目录 **加上** 该环境变量里的密钥。进程不会写密钥文件。丢掉这个值等同丢掉 `encryption.key`。

建议停写后拷整个目录，或：

```bash
sqlite3 /data/shukka.db ".backup /tmp/shukka-backup.db"
```

并同时复制密钥文件。制品在各 app 的 bucket 里，单独做 bucket 版本或生命周期管理，不在数据目录里。

要一份持续更新的异地副本，或跑在容器盘短暂、没有可靠本地卷的平台上，见 [Litestream 复制](/zh-CN/docs/litestream)——镜像已内置，加几个环境变量即可。

升级：拉新镜像或 `git pull && ni && nr --filter shukka build`，停旧进程，用同一数据目录启动新进程。工作目录有 `drizzle/` 时启动会自动 migrate。同一数据目录不要同时跑两个 Shukka 进程。回滚：换回旧镜像 / 旧构建，保留数据目录。

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

要把口令哈希算法换掉（例如迁到 Cloudflare Workers Free 前把 `scrypt$` 换成 `pbkdf2$`）也走这条路。新的 setup **之前**设好 `SHUKKA_PASSWORD_HASH`。不要手改 `admin.password_hash`。

Workers 上对远程库执行同一段 SQL。见 [Cloudflare Workers](/zh-CN/docs/cloudflare#password-recovery)。

## 常见失败

| 现象 | 原因与处理 |
|------|------------|
| 重启后回到 setup | 数据卷没挂上，或 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` 指向空目录 |
| 能登录但改 / 建 app 报 storage 错 | 只恢复了 `.db`，没有同目录的 `encryption.key`（或 filepath / `SHUKKA_ENCRYPTION_KEY` 的值） |
| 进程立刻退出，日志提到 encryption key | 同时设了 `SHUKKA_ENCRYPTION_KEY` 与 filepath（含弃用的 `SHUKKA_KEY_PATH`）；FILEPATH 与 `SHUKKA_KEY_PATH` 不是同一路径；密钥为空 / 不是 64 位 hex；或 filepath 文件不存在 |
| setup 报 `invalid_request` 并提到 `SHUKKA_PASSWORD_HASH` | 该变量不是 `scrypt` 或 `pbkdf2` |
| 启动后表结构旧 | 进程未从应用根启动，数据库迁移未执行 |
| 创建 app 报 `storage_error` | 凭证、bucket、endpoint、path-style 配置错，或 Shukka 主机到 S3 不通 |
| CI finalize 成功但客户端下不下来 | 客户端到 S3 不通 |
| 登录成功但 cookie 没带上 | 面板 origin 与 API origin 不一致（反代拆了主机名） |
| 升级后数据没了 | 新容器没挂原来的卷 |
