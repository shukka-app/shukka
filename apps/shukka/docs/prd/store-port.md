# PRD: 元数据 store port（SQLite 为第一个适配器）

## Problem

领域代码直接对着 `drizzle-orm/sqlite-core` + libsql 写查询：`apps/shukka/src/db`、server 模块、`auth.ts`、keys 路由都绑在 SQLite 方言上。唯一约束只认 SQLite 错误串。Health 是 `SELECT 1`。测试残留 `.get()` / `.run()`。启动 migrate 只覆盖本地 Node `file:`；远程 libsql 要跑 `scripts/migrate-remote.mjs`，因为驱动在运行时才选定，`drizzle-kit migrate` 看不见那个选择。

后续 Postgres 适配器（#89）需要同一套领域用例，而不是把 Drizzle 再包一层方言。

## Users

- **维护者**：领域代码只谈 store port；SQLite 实现进 `packages/store-sqlite`。
- **自托管运维**：默认仍是一个进程、文件 SQLite、启动 `boot()` migrate。Docker / Worker / e2e 的调用面不变。
- **远程 libsql 运维**（Turso / SCF）：进程 `boot()` 会 migrate，不再需要 `migrate-remote.mjs`。

## Goals

1. `packages/store` 提供普通 record 类型、领域用例 port、以及 `StoreAdapter { boot(): Promise<Store> }`。方法对齐今天已有的领域，不为 CloudBase 预留方法。原子单位是方法，不是 `db.transaction(fn)`。
2. `packages/store-sqlite` 承接现有 schema、libsql 客户端、`drizzle/` 迁移。`boot()` = 连接 + Drizzle 编程式 migrate。Worker 不得依赖 `node:fs`（把 journal / SQL 打进包）。
3. 应用用 `std-env` + 动态 `import()` 加载 sqlite 适配器，然后 `await adapter.boot()`。模块顶层 await 保留。
4. `apps/shukka` 的 domain / routes / health / auth / keys 不再 import `~/db`、`drizzle-orm`、libsql 或方言 schema。keys 路由不再直接 insert。
5. `dataDir` 离开 db 模块；`crypto.ts` 不得为了找目录而 import store 包。
6. 唯一约束映射留在 sqlite 适配器内；port 以 `conflict` 返回。`recordHit` 在 `isCloudFunction()` 上仍 no-op。
7. 删除 `scripts/migrate-remote.mjs`。远程 libsql（`SHUKKA_DB_URL`）也经 `boot()` migrate。Docker 仍把 sqlite 迁移 SQL 拷进镜像（Nitro 不会打包那个目录）。
8. SQLite 上的产品 HTTP 行为不变。

## Non-goals

- `packages/store-postgres`（#89）。
- 改 feed 合同、S3、KDF。
- CloudBase 原生数据库。
- 把 SQLite 默认换成别的。

## Flows

### 运维：Docker / 源码自托管

1. 与今天一样启动进程。`boot()` 连接文件 SQLite 并 migrate。
2. 数据仍在 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH`。
3. 面板、上传、feed、health 行为不变。

### 运维：远程 libsql（含 Worker）

1. 设 `SHUKKA_DB_URL`（及可选 token）。
2. 进程启动时 `boot()` migrate，不必先跑 `migrate-remote.mjs`。
3. Worker 使用打包进适配器的 journal / SQL，不读 `node:fs`。

### 维护者：改 schema

1. 在 `packages/store-sqlite` 改 schema。
2. `nr --filter shukka db:generate`（转到该包的 `drizzle-kit generate` + 把 SQL 打进 bundle）。
3. 生产不跑 generate。

## Failure behavior

- 唯一冲突：适配器返回 `conflict`，领域映射为现有 `ShukkaError('conflict', …)`。HTTP 仍是 409。
- migrate 失败：进程起不来（与今天本地 `file:` 路径相同）。
- Worker 缺 `SHUKKA_DB_URL`：建连失败，与今天相同。
- `recordHit` 在云 isolate 上仍直接返回，不写计数器与 bucket。

## Acceptance criteria

- [x] `rg "from '~/db'" apps/shukka` 为空。领域 / 路由不 import `drizzle-orm`、libsql 或方言 schema。
- [x] SQLite 默认：一进程、文件库、`boot()` migrate；Docker / Worker / e2e 对调用方不变。
- [x] 远程 libsql 也经 `boot()` migrate；仓库里没有 `migrate-remote.mjs`。
- [x] 唯一冲突仍是 `conflict`。`recordHit` 在 `isCloudFunction()` 上仍 no-op。
- [x] `check:worker-size` 绿。
- [x] 本切片的 PRD / ADR / spec 已更新。

## Resolved product decisions

- Port 是领域用例，不是 Drizzle-over-N-dialects。类比 `UpdateAdapter`。
- 生命周期是 `boot()`。作者仍在方言包里 `drizzle-kit generate`；运行时从不调 drizzle-kit。
- 本切片只有 sqlite 适配器；Postgres 是下一个子 issue 的第二个实现。
- 整数 id 留在 record 里；HTTP 仍不暴露数字 id。
