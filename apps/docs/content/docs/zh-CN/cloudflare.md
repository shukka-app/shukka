---
title: Cloudflare Workers
description: 把 Shukka 部署到 Cloudflare Workers。需要远程 libsql 数据库，以及写在 secret 里的加密密钥。
---

不想自己挂一台 VPS 时，可以把 Shukka 跑在 Cloudflare Workers 上。打开 Worker URL，设管理员密码，然后像[自托管](/zh-CN/docs/deployment)一样建应用、发版。没有数据卷：数据库是远程 libsql URL，加密密钥用 Wrangler secret。

## 和自托管的差异

| 主题 | Node（Docker / VPS） | Cloudflare Workers |
|------|------|------|
| 数据库 | `SHUKKA_DATA_DIR` 下的本地 SQLite | 远程 libsql HTTP（`SHUKKA_DB_URL`） |
| 表结构 | 工作目录有 `drizzle/` 时进程启动会 migrate | 部署前把 `drizzle/` 施加到远程库。Worker 自己不 migrate |
| 加密密钥 | 默认文件、filepath 或 value 三选一 | **只接受 value**：`SHUKKA_ENCRYPTION_KEY`（64 位 hex）。filepath 会拒绝启动 |
| 口令哈希 | 默认 `scrypt` 即可 | 首次 setup **之前**设 `SHUKKA_PASSWORD_HASH=pbkdf2`（Cloudflare Free CPU）。初始化后锁定 |
| 登录限速 | 同一 IP 15 分钟 10 次失败 | 关闭。防爆破靠平台 WAF / 防火墙 |
| Feed 下载 / 检查计数 | 每次命中写入 | 不记。看量用 Cloudflare 日志 / 分析。feed 仍返回 yml 与 302 |

Free 套餐上 Worker **脚本** gzip 不得超过 Cloudflare 的 **3 MiB** 上限。客户端静态资源不计入该脚本限额。

## 前置

1. 一份 [shukka](https://github.com/shukka-app/shukka) 检出（Worker 构建在该仓库）。
2. Node 24，与 CI 一致。
3. 远程 libsql 数据库（Turso 或兼容 HTTP 端点）。
4. Wrangler 已登录到将持有该 Worker 的 Cloudflare 账号。

把 `drizzle/` 下的 SQL **按顺序**施加到该库，用 Turso CLI 或任何能执行这些语句的客户端。Worker 不会自己跑迁移。不要对生产库跑 `nr --filter shukka db:generate`。

## Secrets

用 Wrangler 写入，不要提交进仓库。

```bash
npx wrangler secret put SHUKKA_ENCRYPTION_KEY
npx wrangler secret put SHUKKA_DB_URL
npx wrangler secret put SHUKKA_DB_AUTH_TOKEN   # 远程库需要 token 时
npx wrangler secret put SHUKKA_PASSWORD_HASH   # pbkdf2 —— 仅首次 setup 前需要
```

| Secret | 是否必填 | 说明 |
|------|------|------|
| `SHUKKA_ENCRYPTION_KEY` | 是 | 64 位 hex（32 字节）。可用 `openssl rand -hex 32` 生成。Workers 上不支持 filepath / `SHUKKA_ENCRYPTION_KEY_FILEPATH` / `SHUKKA_KEY_PATH`。 |
| `SHUKKA_DB_URL` | 是 | 远程 libsql HTTP URL。Node 自托管不读此变量。 |
| `SHUKKA_DB_AUTH_TOKEN` | 库要求时 | 该 URL 的可选 token。 |
| `SHUKKA_PASSWORD_HASH` | 首次 setup 前 | Cloudflare Free 上必须是 `pbkdf2`。setup 之后再改此变量无效。 |

S3 凭证、管理员密码、API key **都不是**进程环境变量。部署后在面板里设置，与 Docker 相同。

生成密钥后自己留一份。丢掉 `SHUKKA_ENCRYPTION_KEY` 就解不开已存的 S3 secret。Worker 不会写 `encryption.key`。

## 部署

在工作区根：

```bash
ni
nr --filter shukka deploy:worker
```

即 `build:worker` 再 `wrangler deploy`。用 `apps/shukka/wrangler.jsonc`。`nr --filter shukka build` 是 Docker / VPS 的构建，不要用在这里。

打开 Worker URL。首次访问进入 setup（密码至少 8 位），之后照常建应用、发版。

对象存储仍按 app 在面板配置。Worker 所在环境必须能打到该 S3 endpoint（Head / Get / Delete / 探针）。CI 与桌面客户端直连存储，不经过 Worker。

## 忘记密码 {#password-recovery}

没有邮箱找回。在远程库删掉管理员行与 session，再打开 setup：

```sql
DELETE FROM admin;
DELETE FROM sessions;
```

把已有 `scrypt$` 实例迁到 Cloudflare Free 时走同一条路，并在 setup 前设 `SHUKKA_PASSWORD_HASH=pbkdf2`。面板不会转换哈希。

手改 `admin.password_hash` 不受支持。库存值以 `scrypt$` 或 `pbkdf2$` 开头，进程按此前缀校验。自己改这一行可能把自己锁在外面，或把 `scrypt$` 管理员留在 Cloudflare Free 上（登录可能超过 CPU 配额）。

## 备份

备份边界是**远程数据库加上** `SHUKKA_ENCRYPTION_KEY` 这个 secret。丢掉任一端都解不开已存 S3 secret。制品仍在各 app 的 bucket 里。

## 部署之后

```bash
curl -sS "https://<your-worker>/api/health"
# {"status":"ok","db":"ok"}
```

Worker 起不来，多半是缺 `SHUKKA_ENCRYPTION_KEY` 或 `SHUKKA_DB_URL`、用了 filepath 密钥，或远程库从未施加过 `drizzle/`。
