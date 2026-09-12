# PRD: MySQL 元数据适配器

## Problem

#88 / #89 把元数据 persistence 收成领域 port，并落地了 SQLite 与 Postgres 适配器。自托管运维若已有 MySQL、或不想把 SQLite 文件当唯一写者、也不用 Postgres，没有第三条实现可切。领域不得再长一套 Drizzle 方言 API。

## Users

- **自托管运维**：用 `SHUKKA_DB_DRIVER=mysql` 加一条 MySQL URL 把元数据放到已有的 MySQL；Docker 默认仍是 SQLite。
- **维护者**：MySQL 实现落在 `packages/store-mysql`，与 sqlite / postgres 共用 `packages/store` port。
- **Cloudflare Workers 运维**：这条路径不存在。Worker 仍走远程 libsql。

## Goals

1. `packages/store-mysql` 实现现有 `Store` port（不发明第二套 port）。`mysqlTable`、同一套唯一约束意图、版本 `metadata` 用 MySQL `json`、时间仍是 unix seconds 的 `int`（不改成 `datetime`）。唯一 / 主键 / 索引字符串用 `varchar`（InnoDB 不能对无前缀 `TEXT` 建 UNIQUE）。
2. `boot()` 用 `mysql2/promise` 连接（不引入原生 addon 客户端），在同一条连接上 `GET_LOCK`，再跑 `drizzle-orm/mysql2/migrator`。作者在该包 `drizzle-kit generate`；运行时不调 drizzle-kit。
3. 唯一约束 `ER_DUP_ENTRY` / `1062` 映射为 port 的 `conflict`。
4. 应用用 `std-env` + 动态 `import()` 按 `SHUKKA_DB_DRIVER` 选适配器。未设或 `sqlite` 仍是默认。Worker 图不得静态包含本包；`check:worker-size` 保持绿。
5. CI 增加 MySQL 容器 job，跑与 sqlite 相同的领域 / store 套件。
6. 可选 Compose overlay 提供 MySQL，不是默认 `compose.yaml`。Docker 默认镜像仍是 sqlite。
7. 本切片的 PRD / ADR / spec / 部署环境变量表一并更新。

## Non-goals

- 把 SQLite 换成 Docker 默认。
- Cloudflare Workers 上的 MySQL。
- CloudBase 原生数据库。
- 一次性 sqlite / Postgres → MySQL dump/load。
- 多实例抢同一库的 HA 产品化。
- 改 feed、S3、KDF，或移动根 `action.yml`。

## Flows

### 运维：源码 / systemd 切到 MySQL

1. 准备可连的 MySQL 8，记下 URL。
2. 设 `SHUKKA_DB_DRIVER=mysql` 与 `SHUKKA_DB_URL=mysql://…`。
3. 启动进程。`boot()` 连接、加锁、migrate。
4. 面板、上传、feed、health 与 SQLite 路径同一套 HTTP 合同。
5. 加密密钥仍按现有规则（数据目录文件或 `SHUKKA_ENCRYPTION_KEY*`），与元数据库无关。

### 运维：Docker 可选 MySQL

1. 默认 `docker run` / `compose.yaml` 不变，仍是文件 SQLite + `/data` 卷。
2. 需要 MySQL 时叠加 overlay：
   `docker compose -f apps/shukka/deploy/compose.yaml -f apps/shukka/deploy/compose.mysql.yaml up -d`
3. 镜像内仍带 sqlite 迁移 SQL；MySQL 迁移 SQL 在 `/app/drizzle-mysql`，仅当 driver 为 mysql 时使用。

### 运维：Worker

不设 `SHUKKA_DB_DRIVER=mysql`。Worker 继续要求 `SHUKKA_DB_URL` 为远程 libsql。

### 维护者：改 MySQL schema

1. 在 `packages/store-mysql` 改 schema（不要与 sqlite / postgres 共用一份 schema）。
2. `nr --filter shukka db:generate:mysql`。
3. 生产不跑 generate。

## Failure behavior

- 缺 `SHUKKA_DB_URL` 却设了 `mysql`：`boot()` 失败，进程起不来。
- 唯一冲突：适配器返回 `conflict`，领域仍映射为 409。
- 两个进程同时 `boot()` migrate：`GET_LOCK` 串行化，不损坏 `__drizzle_migrations`。migrate 失败则进程起不来。
- Worker 上设 `SHUKKA_DB_DRIVER=mysql`：启动失败；打包图里没有 mysql2。
- 未知 `SHUKKA_DB_DRIVER`：启动失败。

## Acceptance criteria

- [x] 每个 `Store` 方法在 MySQL 上可用，包括原子用例。
- [x] `boot()` 会 migrate；重叠的两次 boot 不损坏 `__drizzle_migrations`。
- [x] 唯一冲突是 `conflict`。
- [x] SQLite 套件仍绿。MySQL CI job 绿。
- [x] Worker 构建不拉 MySQL 客户端；`check:worker-size` 绿。
- [x] 文档写明环境变量、opt-in、以及「不是 Docker 默认」。

## Resolved product decisions

- 实现现有 port，不另开一套。
- 秒仍是 integer；版本 metadata 用 MySQL json。
- 客户端是 mysql2，不是原生 addon 客户端。
- SQLite 仍是默认；MySQL 是 `SHUKKA_DB_DRIVER=mysql` + URL。
- Worker+MySQL 不交付。CloudBase 原生库不交付。
