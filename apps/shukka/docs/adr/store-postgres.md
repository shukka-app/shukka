# ADR: Postgres 适配器走同一 Store port，boot() 里 advisory lock + migrate

## Status

Accepted.

## Context

#86 钉死：port 是领域用例；生命周期是 `boot()`；SQLite 仍是默认；Postgres 是真实的第二个适配器。#88 抽出了 port 并把 sqlite 移到 `boot()`。本切片落地 Postgres，不重开 port，也不把 SQLite 挤出 Docker 默认。

Worker 有 3 MiB gzip 上限，且 postgres.js / `node:fs` migrator 不适合 isolate。#86 已排除 Worker+Postgres。

见 `docs/prd/store-postgres.md`。sqlite 路径的约束仍由 [store-port](store-port.md) 覆盖。

## Decision

1. **`packages/store-postgres`**：自己的 `pgTable` schema 与 `drizzle/`，不和 sqlite 共用 schema。唯一约束意图对齐（slug、channel 名、channel+version、pending channel+version、api key hash、hit bucket、note locale）。版本 `metadata` 为 `jsonb`。unix seconds 列为 `integer`，不用 `timestamptz`。
2. **连接**：`postgres`（postgres.js）。禁止原生 `pg` addon。
3. **`boot()`**：连接 → session `pg_advisory_lock` → `drizzle-orm/postgres-js/migrator`（读包内 / 镜像 `drizzle-postgres/` 的 journal+SQL）→ unlock → 返回 `Store`。migrate 用 `max: 1` 客户端，保证锁与 migrator 同一 session。
4. **冲突**：Postgres `23505` → port `conflict`。`isUniqueConstraint` 不离开适配器。
5. **应用入口**：`std-env` 确认 Node 后动态 `import('@shukka/store-postgres')`。`SHUKKA_DB_DRIVER` 未设或 `sqlite` 走 sqlite 适配器。Worker Vite 把该包名 alias 到抛错 stub，isolate 图不含 postgres.js。
6. **URL**：`SHUKKA_DB_DRIVER=postgres` 时 `SHUKKA_DB_URL` 是 Postgres 连接串。sqlite 远程 libsql 仍用同一变量名、不同 driver。缺 URL 则 boot 失败。
7. **编排**：默认 Compose / 镜像仍是 sqlite。Postgres 是 `apps/shukka/deploy/compose.postgres.yaml` overlay，不是默认文件。
8. **CI**：独立 job，Postgres 容器 + 与 sqlite 相同的 `pnpm --filter shukka test` 以及 `@shukka/store-postgres` 测试。
9. **镜像**：运行镜像仍默认 sqlite；额外拷贝 `packages/store-postgres/drizzle` 到 `/app/drizzle-postgres`，以便同一镜像被 opt-in 使用。

## Alternatives

- **Drizzle 多方言同一套 query builder**：#86 已拒。
- **`pg` / `node-postgres`**：原生 addon，Docker/CI 更重。拒绝。
- **事务 advisory lock（`pg_advisory_xact_lock`）**：migrator 可能跨语句；session lock 盖住整个 migrate。拒绝 xact lock。
- **把 Postgres 打进默认 Compose**：违背「SQLite 仍是默认 / Docker 不长 Postgres 进程除非运维选择」。拒绝。
- **Worker 也跑 Postgres**：#86 排除；体积与 `node:fs` migrator 都不成立。拒绝。
- **CloudBase `app.rdb()` / 文档库**：#86 排除。拒绝。

## Trade-offs & failure bounds

- 同一镜像可切 Postgres，但默认路径零额外进程。运维要自己提供可达的 Postgres。
- 并发 `boot()` 会排队等 advisory lock；残缺 migrate 仍会使后到的进程起不来。
- Worker 误设 `SHUKKA_DB_DRIVER=postgres` 会启动失败，而不会把 postgres.js 打进脚本。
- 不提供 sqlite 文件导入 Postgres；换驱动等于空库，面板重走 setup。
- HTTP 对外合同不变。
