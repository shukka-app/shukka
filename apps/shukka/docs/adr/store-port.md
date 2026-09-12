# ADR: 元数据 persistence 是领域 port，SQLite 适配器在 boot() 里 migrate

## Status

Accepted.

## Context

每个查询都内联在 `drizzle-orm/sqlite-core` + libsql 上。唯一约束只匹配 SQLite。Health 是 `SELECT 1`。测试残留同步风格的 `.get()` / `.all()` / `.run()`。启动 migrate 只覆盖本地 Node `file:`；远程 libsql 是旁路脚本，因为驱动在运行时选定。

#86 已钉：port 是领域用例，不是 Drizzle-over-N-dialects；生命周期是 `boot()`；SQLite 仍是默认。本切片抽出 port 并把现有 SQLite 栈移到第一个适配器。Postgres 包不在这里加。

见 `docs/prd/store-port.md`。本决策取代 [libsql-async](libsql-async.md) 的「isolate 内不 migrate」与 [metadata-sqlite-drizzle](metadata-sqlite-drizzle.md) 里「Postgres 能力过剩、产品排除」对 *sqlite 路径* 的约束——Postgres 仍不是本切片的范围，只是不再用那句话挡住 port。

## Decision

1. **`packages/store`**：普通 TS record（整数 id）+ `Store` 用例接口 + `StoreAdapter { boot(): Promise<Store> }`。领域与路由只依赖这套类型。不为 CloudBase 预留方法。
2. **原子单位是方法**，不是把 `db.transaction(fn)` 暴露给领域。今天已经是事务的用例保持为单一方法：
   - 创建 app + 默认 `stable` channel
   - 改密 + 清空 sessions
   - finalize：version + artifacts + 可选 current + 删除 pending
   - promote：draft 则写 `releasedAt`，再切 current
   - 删除 version + 必要时把 current 指回最新已发布
   - recordHit：计数器 + 小时 bucket（领域在 `isCloudFunction()` 上仍 no-op，适配器本身总是写）
3. **冲突**：sqlite 适配器把唯一约束映射为 port 的 `conflict`。领域再变成 `ShukkaError('conflict')`。`isUniqueConstraint` 不离开适配器。
4. **`packages/store-sqlite`**：搬走 schema、libsql 客户端、`drizzle/`。`boot()` 连接（Node `file:` / 远程 Node / isolate HTTP）然后编程式 migrate。
5. **Migrate 必须加锁。** overlapping `boot()` 串行化 journal 施加。SQLite / libsql：整段 migrate 包在一次 write 事务里（`client.transaction()` → `BEGIN IMMEDIATE`）。Postgres：session `pg_advisory_lock(MIGRATE_LOCK_KEY)`（钥匙在 `packages/store`）。Drizzle migrator 自己没有这把锁。
6. **Migrate**：
   - 作者仍在该包 `drizzle-kit generate`。
   - 运行时把 journal + SQL 打进适配器模块，按 Drizzle `__drizzle_migrations` 表施加（与 `drizzle-orm/libsql/migrator` 同一套 hash / `created_at`）。Worker 不读 `node:fs`。
   - Node 动态加载 migrator 会把 `node:fs` 拉进图，所以 isolate 路径不得 import 它。
   - Docker 仍把 `drizzle/` SQL 拷到镜像 `/app/drizzle`（Nitro 不会打包那个目录；运维与源码启动仍能看见文件）。
   - `scripts/migrate-remote.mjs` 删除。`SHUKKA_DB_URL` 也走 `boot()`。
7. **应用入口**：`std-env` + 动态 `import()` sqlite 适配器，`await adapter.boot()`。模块顶层 await 保留（今天的 `export const db = await createDb()`）。本切片不读 `SHUKKA_DB_DRIVER`。
8. **`dataDir`** 属于进程路径（加密密钥文件），不属于 store。`crypto.ts` 不 import store 包。
9. **测试**：应用测试走领域 / store。`.get()` / `.all()` / `.run()` 只允许出现在 sqlite 适配器测试里。

## Alternatives

- **Drizzle 多方言同一套 query builder**：领域仍泄漏 ORM，Postgres 与 SQLite 的事务 / 冲突 / 时间函数还是对不齐。拒绝。
- **继续 `migrate-remote.mjs`**：与「生命周期是 boot()」冲突，远程路径继续分叉。拒绝。
- **本切片同时加 Postgres 包**：#89 的范围；只有 sqlite 的 port 才是本切片的点。拒绝。
- **Worker 继续不 migrate**：被 #86 的 boot() 取代。拒绝。

## Trade-offs & failure bounds

- 只有 sqlite 实现时 port 看起来像多包。这是有意的：#89 落地前先把领域从方言解开。
- 并发 Worker / SCF 冷启动会在 write 事务上排队 migrate；残缺施加仍会使后到的进程起不来，与今天本地 migrate 失败相同。
- 打包 SQL 会进 Worker 脚本体积；`check:worker-size` 卡住 3 MiB gzip。
- HTTP 对外合同不变。改的是谁拥有查询，不是 feed / 上传 / health 的形状。
