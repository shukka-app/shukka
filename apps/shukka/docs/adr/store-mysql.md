# ADR: MySQL 适配器走同一 Store port，boot() 里 GET_LOCK + migrate

## Status

Accepted.

## Context

#86 钉死：port 是领域用例；生命周期是 `boot()`；SQLite 仍是默认。#88 抽出了 port 并把 sqlite 移到 `boot()`。#89 落地了 Postgres。本切片落地 MySQL，不重开 port，也不把 SQLite 挤出 Docker 默认。

Worker 有 3 MiB gzip 上限，且 mysql2 / `node:fs` migrator 不适合 isolate。与 Worker+Postgres 一样排除 Worker+MySQL。

见 `docs/prd/store-mysql.md`。sqlite 路径的约束仍由 [store-port](store-port.md) 覆盖；Postgres 由 [store-postgres](store-postgres.md) 覆盖。

## Decision

1. **`packages/store-mysql`**：自己的 `mysqlTable` schema 与 `drizzle/`，不和 sqlite / postgres 共用 schema。唯一约束意图对齐（slug、channel 名、channel+version、pending channel+version、api key hash、hit bucket、note locale）。版本 `metadata` 为 MySQL `json`。unix seconds 列为 `int`，不用 `datetime`。唯一 / 主键 / 索引字符串用 `varchar`，因为 InnoDB 不能对无前缀 `TEXT` 建 UNIQUE。release note 的 `markdown` / `html` / `text` 用 `mediumtext`：MySQL `TEXT` 只有 65,535 字节，而 port 允许 64 KiB markdown。
2. **连接**：`mysql2/promise`。禁止再引入一套原生 addon 客户端。
3. **`boot()`**：连接 → 同一条连接 `GET_LOCK(String(MIGRATE_LOCK_KEY), -1)`（钥匙在 `packages/store`，与 sqlite 的 write 事务、Postgres advisory lock 同一合同）→ `drizzle-orm/mysql2/migrator`（读包内 / 镜像 `drizzle-mysql/` 的 journal+SQL）→ `RELEASE_LOCK` → 返回 `Store`。migrate 用单连接，保证锁与 migrator 同一 session。Drizzle migrator 自己没有锁。服务连接另开 `connectionLimit: 10` 的 pool。
4. **冲突**：MySQL `ER_DUP_ENTRY` / `errno 1062` → port `conflict`。`isUniqueConstraint` 不离开适配器。不要用过宽的 `sqlState 23000`。
5. **无 `RETURNING`**：MySQL 8 没有 `INSERT/UPDATE/DELETE … RETURNING`。自增插入用 `$returningId()` 再 `SELECT`；upsert / delete 按唯一键再读。`recordHit` / `upsertNote` 用 `onDuplicateKeyUpdate`（表上除 PK 外只有一个 unique，冲突目标明确）。
6. **应用入口**：`std-env` 确认 Node 后动态 `import('@shukka/store-mysql')`。`SHUKKA_DB_DRIVER` 未设或 `sqlite` 走 sqlite 适配器。Worker Vite 把该包名 alias 到抛错 stub，isolate 图不含 mysql2。
7. **URL**：`SHUKKA_DB_DRIVER=mysql` 时 `SHUKKA_DB_URL` 是 MySQL 连接串。sqlite 远程 libsql 仍用同一变量名、不同 driver。缺 URL 则 boot 失败。不按 URL scheme 自动探测。
8. **编排**：默认 Compose / 镜像仍是 sqlite。MySQL 是 `apps/shukka/deploy/compose.mysql.yaml` overlay，不是默认文件。
9. **CI**：独立 job，MySQL 容器 + 与 sqlite 相同的 `pnpm --filter shukka test` 以及 `@shukka/store-mysql` 测试。
10. **镜像**：运行镜像仍默认 sqlite；额外拷贝 `packages/store-mysql/drizzle` 到 `/app/drizzle-mysql`，以便同一镜像被 opt-in 使用。

## Alternatives

- **Drizzle 多方言同一套 query builder**：#86 已拒。
- **原生 addon 客户端 / `mariadb` connector**：Docker/CI 更重，或偏离 drizzle mysql2 默认路径。拒绝。
- **依赖 MariaDB `RETURNING`**：用户要的是 MySQL。拒绝。
- **把 MySQL 打进默认 Compose**：违背「SQLite 仍是默认 / Docker 不长 MySQL 进程除非运维选择」。拒绝。
- **Worker 也跑 MySQL**：体积与 `node:fs` migrator 都不成立。拒绝。
- **CloudBase 原生库**：#86 排除。拒绝。

## Trade-offs & failure bounds

- 同一镜像可切 MySQL，但默认路径零额外进程。运维要自己提供可达的 MySQL 8。
- 并发 `boot()` 会排队等 `GET_LOCK`；残缺 migrate 仍会使后到的进程起不来。
- Worker 误设 `SHUKKA_DB_DRIVER=mysql` 会启动失败，而不会把 mysql2 打进脚本。
- 不提供 sqlite / Postgres 文件导入 MySQL；换驱动等于空库，面板重走 setup。
- HTTP 对外合同不变。
- hit bucket 聚合用 `DIV` 与 `CAST(SUM(...) AS SIGNED)`，避免 MySQL `/` 变成小数、`SUM` 变成字符串。
