# PRD: 自托管部署

## Problem

Shukka 是单管理员自托管服务。仓库已有 `Dockerfile` 和 README 里的最短启动命令，但没有一份按真实运行时约束写完的部署指南：SQLite 必须落在持久盘、S3 按 app 在面板配置、进程是单个 Node、制品字节不经过本机。缺少这份文档时，运维会按无状态/serverless 习惯部署，丢掉数据库或加密密钥。

## Users

- **运维 / 管理员**（同一人）：把 Shukka 实例跑起来、配反向代理与对象存储、备份与升级、忘记密码时恢复。
- **CI**：不部署 Shukka；只对已运行实例用 API key 发版（见 `docs/prd/update-platform.md` 与 `.agents/skills/shukka-ops/`）。

## Goals

1. 一份可跟着做的部署指南：前置条件、环境变量、构建启动、迁移、对象存储、TLS、备份、升级、探活、常见失败。
2. 推荐路径与现有架构一致：单进程 Node + 一块持久化数据卷 + 每 app 自配 S3（见 `docs/adr/self-host-runtime.md`）。
3. 明确不适合的托管形态（无持久盘、多副本抢同一 SQLite、serverless）。
4. 所有环境变量、端口、探活路径都来自代码或 Nitro 运行时，不臆造。

## Non-goals

- 不发明 `SHUKKA_PUBLIC_URL`。加密密钥来源（filepath / value / 默认文件）是本指南的运行时合同，实现见 `docs/adr/encryption-key-source.md`。Compose / Ansible 示例见 `docs/prd/deploy-examples.md`；健康探针与 GHCR 发布见 `docs/prd/health-endpoint.md`、`docs/prd/container-image.md`。
- 不把 Shukka 做成多实例/HA，也不引入 Postgres。
- 不写「如何把桌面应用接到 feed」——那是 shukka-ops，不是本机部署。
- 不提供托管 SaaS。

## 推荐路径

**一台 VPS（或同等单机）上跑仓库根 `Dockerfile` 构建的容器，挂一个持久卷到 `/data`，前面用 Caddy / nginx 终结 TLS。** 对象存储用 Cloudflare R2、AWS S3 或独立 MinIO；不要和 Shukka 进程抢同一块 ephemeral 盘当制品库。

理由：ADR [metadata-sqlite-drizzle](../adr/metadata-sqlite-drizzle.md) 的运维假设就是「一个容器 + 一个卷」；`Dockerfile` 已把 `SHUKKA_DATA_DIR=/data`、`.output` 与 `drizzle/` 装进镜像。制品走 presigned URL，本机只需持久化 SQLite 与加密密钥。

## Flows

### 运维：用 Docker 部署（主路径）

1. 准备一台能跑 Docker 的 Linux 主机、一个域名、以及 S3 兼容存储（创建 app 时再用，不是启动前置）。
2. 拉公开镜像并运行（工作目录必须是应用根，迁移读 `./drizzle`）。没有镜像时在仓库根 `docker build -t shukka .`，把下面的镜像名换成 `shukka`：

```bash
docker run -d --name shukka --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v shukka-data:/data \
  ghcr.io/shukka-app/shukka
```

3. 反代到 `127.0.0.1:3000`，对外只暴露 HTTPS。
4. 打开面板，首次访问进入 setup，设置至少 8 位管理员密码。
5. 创建 app 并做 S3 写探测；探测失败不会落库。
6. 用下面「探活 / 冒烟」确认三类 HTTP 面都通。

公开镜像是 `ghcr.io/shukka-app/shukka`（semver 标签发布，见 `docs/prd/container-image.md`）。拉取失败时在仓库根 `docker build -t shukka .`。

同一份编排在 `deploy/compose.yaml`（Shukka + 示例 MinIO）。钉版本用 `SHUKKA_IMAGE`：

```bash
docker compose -f deploy/compose.yaml up -d
docker exec minio mkdir -p /data/releases
```

多机或重复安装用 `deploy/ansible/playbook.yml`（把上面的 Compose 拷到主机并等到 health）。Docker Compose v2 是前置条件。见 `docs/prd/deploy-examples.md`。

### 运维：从源码 + systemd

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

### 运维：本机 MinIO（可选）

Shukka **不**随镜像带对象存储。需要自建 S3 时用 `deploy/compose.yaml` 里的 MinIO，或另起一个，再在面板创建 app（MinIO：填 endpoint、勾 path-style；向导默认 region `us-east-1`）。GitHub Actions 必须能从公网打到该 endpoint——presigned PUT 由 CI 直传，不经过 Shukka。Shukka 仍只挂自己的数据卷。

`npm run juicefs` / `scripts/juicefs-dev.mjs` 只给本地开发当 S3 网关，不是生产部署方案。

### 管理员：忘记密码

没有邮箱找回。停掉写入后打开数据目录里的 SQLite，删掉管理员行与 session，重启后重走 setup（同一路径也用于把已有 `scrypt$` 换成 `pbkdf2$`）：

```bash
sqlite3 /var/lib/shukka/shukka.db "DELETE FROM admin; DELETE FROM sessions;"
```

Docker 卷默认在 `/data/shukka.db`。删的是密码与登录态，app / channel / 版本记录还在。

## 环境变量

进程会读的变量如下。S3、管理员密码明文、API key **都不是**启动环境变量。`SHUKKA_PASSWORD_HASH` 只在**尚未初始化**的首次 setup 选用口令哈希算法，之后忽略。

| 变量 | 默认 | 用途 |
|------|------|------|
| `PORT` 或 `NITRO_PORT` | `3000` | HTTP 端口（Nitro：`NITRO_PORT` 优先） |
| `HOST` 或 `NITRO_HOST` | 未设（听全部地址） | 绑定地址 |
| `SHUKKA_DATA_DIR` | `./data`（镜像内 `/data`） | SQLite 目录；未设置下方密钥变量时也是 `encryption.key` 的自动生成位置 |
| `SHUKKA_DB_PATH` | `{data}/shukka.db` | 覆盖数据库文件路径 |
| `SHUKKA_ENCRYPTION_KEY_FILEPATH` | 未设 | 从该文件读取 S3 secret 的 AES 密钥（64 位 hex，32 字节）。设置后只读该文件，不自动生成；路径不是数据目录时不写 `./data` |
| `SHUKKA_ENCRYPTION_KEY` | 未设 | 直接提供同一格式的密钥。设置后不写密钥文件 |
| `SHUKKA_KEY_PATH` | 未设 | **已弃用**，等同 `SHUKKA_ENCRYPTION_KEY_FILEPATH`，保留一个版本。与 FILEPATH 设成不同路径、或与 VALUE 同时出现则拒绝启动 |
| `SHUKKA_TRUST_PROXY` | 未设 | 设 `1` 或 `true` 时采信反代追加的 `X-Forwarded-For`（最右一跳）与 `X-Real-IP` 作为登录限速键；未设则忽略这些头，所有直连客户端共用一个桶 |
| `SHUKKA_PASSWORD_HASH` | 未设（`scrypt`） | 仅首次 setup 选用管理员口令哈希：未设或 `scrypt` → `scrypt$…`；`pbkdf2` → `pbkdf2$…`。初始化之后改密沿用已存前缀，再改此变量无效。非法值（如 `argon2`）使 setup 返回 `invalid_request`。见 `docs/prd/password-kdf.md` |
| `NODE_ENV` | 镜像内 `production` | Node 生产模式 |
| `NITRO_SSL_CERT` + `NITRO_SSL_KEY` | 未设 | 在 Node 进程上开 TLS（通常不如反代） |
| `NITRO_UNIX_SOCKET` | 未设 | 改走 UNIX socket |

`SHUKKA_ENCRYPTION_KEY` 与 `SHUKKA_ENCRYPTION_KEY_FILEPATH` **只能设其中一个**。都未设则保持今天的默认：首次启动在 `{SHUKKA_DATA_DIR}/encryption.key` 生成密钥。空值或非法 hex 拒绝启动。

`SHUKKA_PASSWORD_HASH` 在首次 setup **锁定**：默认 scrypt，现有 Docker / VPS 不用改。已写入的 `scrypt$` 不会因为后来改成 `pbkdf2` 而转换。要把已有实例迁到只适合 pbkdf2 的运行时（如日后 Cloudflare Workers Free），删除 `admin` 与 `sessions` 后设 `SHUKKA_PASSWORD_HASH=pbkdf2` 再走 setup。

仅客户端 / CI / 测试脚本使用、**不要**当成 Shukka 服务配置：`SHUKKA_URL`、`SHUKKA_SERVER_URL`、`SHUKKA_API_KEY`、`SHUKKA_APP`、`SHUKKA_PASSWORD`（`.github/scripts/provision.mjs` 的测试默认值）、`MINIO_*`。

## 反向代理与 TLS

- 面板、`/api/v1`、`/api/update` 同端口同进程。反代把整个 origin 转到 Shukka，不要拆路径到不同后端。
- 保留 `Host`。对外用 HTTPS。
- Session cookie 名 `shukka_session`：`HttpOnly`、`SameSite=Lax`、14 天；**没有** `Secure` 标志。
- 面板 Integration 与 Tauri feed JSON 里的绝对 URL 来自 `request.url.origin`。Nitro node-server **默认不信任** `X-Forwarded-Proto`。TLS 终结在反代、回源是 HTTP 时，Shukka 看到的 origin 可能是 `http://…`。
  - Electron：yml 原文透传、制品文件名相对；把 `https://…/api/update/{app}/{channel}` 写进 electron-builder 即可。
  - Tauri：`latest.json` 的 `url` 按本次请求的 origin 生成。`curl -sS https://your.host/api/update/{app}/{channel}` 若看到 `http://` 制品 URL，让反代对后端也走 TLS，或给进程配 `NITRO_SSL_CERT` / `NITRO_SSL_KEY`。
- Tauri 生产客户端默认要求 HTTPS（`docs/adr/updater-kind-on-app.md`）。本机或无 TLS 的 HTTP feed 必须由**使用者**在 tauri.conf 设置 `plugins.updater.dangerousInsecureTransportProtocol: true`（官方键；不是 Shukka 服务端开关）。生产省略该键，用 HTTPS。接入步骤见 `docs/prd/tauri-integration.md`。
- 自托管 Node：登录失败按来源 IP 限速（15 分钟 10 次）。反代后面部署时设置 `SHUKKA_TRUST_PROXY=1`，才会采信反代追加的转发头（最右一跳）；未设则忽略 `X-Forwarded-For` / `X-Real-IP`。不要把 setup / login 裸露在无防护的公网而不做 TLS。
- 云函数 / Edge isolate：进程内限速关闭（内存 `Map` 跨 isolate 无效）。登录防爆破靠主机 WAF / 防火墙，不靠 Shukka。见 `docs/prd/login-rate-limit.md`。

## 对象存储

每 app 独立：endpoint、region、bucket、prefix、access key、secret、force path style。创建/保存前服务端 Put+Delete 探针对象（`{prefix}/.shukka/probe/…`）。

| 厂商 | 要点 |
|------|------|
| AWS S3 | endpoint 留空；region 为真实区域 |
| Cloudflare R2 | endpoint 为 R2 S3 API；region `auto` |
| MinIO | 填 endpoint，强制 path-style |
| 其他兼容实现 | 按对方文档；多数要 path-style |

CI 与桌面客户端必须能访问该 endpoint（上传 PUT、下载跟 302）。Shukka 主机也必须能 Head/Get/Delete（finalize 与删版本）。Presigned URL 有效期 1 小时。

## 备份与升级

**默认与文件模式的备份边界是整个数据目录**（默认 `./data` / `/data`）：`shukka.db`、WAL（`shukka.db-wal` / `shukka.db-shm`）、以及 `encryption.key`（或 `SHUKKA_ENCRYPTION_KEY_FILEPATH` / `SHUKKA_KEY_PATH` 指向的文件）。只拷数据库、丢掉密钥，就解不开已存的 S3 secret。

**`SHUKKA_ENCRYPTION_KEY` 模式**：备份是数据库目录 **加上** 该环境变量里的密钥。丢掉这个值同样解不开已存 S3 secret；进程不会在数据目录写密钥文件。

建议停写后拷整个目录，或：

```bash
sqlite3 /data/shukka.db ".backup /tmp/shukka-backup.db"
```

并同时复制密钥文件（默认 `encryption.key`，或你设置的 filepath）。制品在各 app 的 bucket 里，单独做 bucket 版本或生命周期，不在数据目录里。

升级：拉新镜像或 `git pull && npm ci && npm run build`，停旧进程，同一数据目录启动新进程。启动时若 cwd 下存在 `drizzle/` 会自动 migrate。同一数据目录不要跑两个 Shukka 进程。回滚：换回旧镜像/旧构建，保留数据目录；不要对生产库跑 `db:generate`。

## 探活 / 冒烟

编排器用 `GET /api/health`（`200 { status: "ok", db: "ok" }`，SQLite 不可达则 `503`）。面板初始化态仍看 session：

```bash
curl -sS "$SHUKKA_URL/api/health"
# {"status":"ok","db":"ok"}

curl -sS "$SHUKKA_URL/api/admin/session"
# {"initialized":false,"authenticated":false}   首次
# {"initialized":true,"authenticated":false}    已设密未登录
```

设密并建 app 之后：

1. 未登录打开 `/apps` → 重定向到 `/login`（未初始化则 `/setup`）。
2. `GET /api/update/{app}/{channel}/latest.yml`（Electron）或 `GET /api/update/{app}/{channel}`（Tauri）：无已发布版本时 404；有则 200。
3. 已发布制品：`curl -sSI "$SHUKKA_URL/api/update/{app}/{channel}/{filename}"` → 302。
4. 创建 app 时面板「测试连接」成功，或 `POST /api/admin/storage/test` 返回 `{ ok: true }`。

## 其他托管形态

| 形态 | 结论 |
|------|------|
| 单机 systemd（上一节） | 可行，等价于主路径减去容器 |
| Compose：Shukka + 可选 MinIO | 可行；用 `deploy/compose.yaml`，MinIO 要对 CI/客户端可达 |
| Fly.io / Railway / Render 等带持久盘的单实例 PaaS | 可以，必须挂持久卷到 `SHUKKA_DATA_DIR`，**副本数 = 1** |
| 多副本 / 滚动两实例共用一块 SQLite | 不要 |
| Vercel / Netlify / Cloudflare Workers / 无盘 Lambda | 不适合：文件系统短暂、`better-sqlite3` 原生绑定、SQLite 单写者 |

## 常见失败

| 现象 | 原因与处理 |
|------|------------|
| 重启后回到 setup | 数据卷没挂上，或 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` 指向空目录 |
| 能登录但改/建 app 报 storage 错，S3 secret 怪 | 只恢复了 `.db`，没有同目录的 `encryption.key`（或 filepath 指向的文件）；或用了 `SHUKKA_ENCRYPTION_KEY` 但恢复后没设同一个值 |
| 进程立刻退出，日志提到 encryption key | 同时设了 `SHUKKA_ENCRYPTION_KEY` 与 filepath（含弃用的 `SHUKKA_KEY_PATH`）；FILEPATH 与 `SHUKKA_KEY_PATH` 不是同一路径；或密钥为空 / 不是 64 位 hex / filepath 文件不存在 |
| 启动后表结构旧 | 进程 cwd 下没有 `drizzle/`（没从应用根启动，或镜像没 `COPY drizzle`） |
| 创建 app：`storage_error` | 凭证、bucket、endpoint、path-style，或 Shukka 主机到 S3 不通 |
| CI finalize 成功但客户端下不下来 | 客户端到 S3 不通；或 Tauri feed 里的 `url` 是 `http://`（见 TLS 节）。HTTP endpoint 还须使用者在 tauri.conf 打开 `dangerousInsecureTransportProtocol` |
| 登录成功但 cookie 没带上 | 面板 origin 与 API origin 不一致（反代拆了主机名） |
| 升级后数据没了 | 新容器没挂原来的卷 |

## Acceptance criteria

- [x] 按主路径（Docker + `/data` 卷）可以从零启动，首次打开进入 setup。
- [x] 文档列出的环境变量与代码 / Nitro 运行时一致；没有把 S3 或管理员密码明文写成必填环境变量。`SHUKKA_PASSWORD_HASH` 可选，只影响首次 setup，初始化后锁定。
- [x] 写明已有 `scrypt$` 要上只适合 pbkdf2 的运行时须重走 setup，面板不转换。
- [x] 备份说明包含 SQLite **和** 密钥（默认/`FILEPATH` 下的文件，或 `SHUKKA_ENCRYPTION_KEY` 的值）；只备份其一被标为失败模式。
- [x] 文档写明密钥三选一：未设则 `{data}/encryption.key` 自动生成；只设 filepath 则只读该文件；只设 value 则不写密钥文件；两新变量同时设、或与弃用别名冲突、或非法 hex，进程不起。
- [x] 探活用 `GET /api/health`；初始化态仍可用 `GET /api/admin/session`。
- [x] 写明 serverless / 无持久盘 / 多副本 SQLite 不适合。云 isolate 上登录限速关闭，防爆破靠主机防火墙。
- [x] 写明 cwd 与 `./drizzle` 自动迁移的关系。

## Resolved product decisions

- 主路径是自建单机 Docker，不是 PaaS 优先。
- S3 加密密钥默认仍自动生成到数据目录；运维可改用 `SHUKKA_ENCRYPTION_KEY_FILEPATH` 或 `SHUKKA_ENCRYPTION_KEY` 二选一（见 `docs/adr/encryption-key-source.md`）。`SHUKKA_KEY_PATH` 保留一个版本作 filepath 别名。
- 管理员密码只在面板首次设置，不从环境变量注入（与 `docs/adr/auth-model.md` 一致）。口令哈希算法可在 setup 前用 `SHUKKA_PASSWORD_HASH` 选定，初始化后锁定（见 `docs/prd/password-kdf.md`）。
- Compose / Ansible 示例见 `docs/prd/deploy-examples.md`。健康探针与 GHCR 发布已另立 PRD。
- Tauri 在反代后 origin 为 http 的问题按运行时限制记录，不发明 `SHUKKA_PUBLIC_URL`。
