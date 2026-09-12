# ADR: 用 libsql 替换 better-sqlite3（std-env 选入口，动态 import）

## Status

Accepted.

## Context

元数据是 SQLite + Drizzle、启动 migrate、单文件（[metadata-sqlite-drizzle](metadata-sqlite-drizzle.md)）。驱动是同步的 `better-sqlite3`：原生绑定与 Docker/Alpine/Workers 冲突；领域层全是 `.get()` / `.all()` / `.run()` / 同步 `db.transaction`。libsql 能用同一 SQL 走本地 `file:` 和日后 HTTP 远程，但 API 是异步的。产品合同不变。见 `docs/prd/libsql-async.md`。

运行时检测已经集中在 `src/lib/runtime.ts`（`std-env` 的 `isWorkerd` / `isEdgeLight` / `isNetlify` / `isFastly`），登录限速与 feed 命中共用。不要再发明 `process.env.CF`。

## Decision

1. **驱动**：`@libsql/client` + `drizzle-orm/libsql`。schema 与 `drizzle/` 迁移文件不动。
2. **入口（只动态 `import()`，禁止静态拉原生客户端进 Worker 图）**：
   - `runtime === "node"`（真 Node，不是 Bun/Deno 的 `isNode` 兼容）→ `@libsql/client`，URL `file:${SHUKKA_DB_PATH}`。
   - 其它（含 `isWorkerd` / edge）→ `@libsql/client/web`（HTTP，无原生）。
3. **检测** 放在 `src/lib/runtime.ts`：`isNodeRuntime()`、`libsqlClientEntry()`。与 `isCloudFunction()` 同一套 `std-env`，不复制冲突逻辑。
4. **Migrate**：仅 Node 且 `./drizzle` 存在时动态加载 `drizzle-orm/libsql/migrator`。isolate 内不 migrate（wrangler / Turso 施加属 #51）。
5. **Node 连接后** 在适配器里执行 `PRAGMA journal_mode = WAL` 与 `PRAGMA foreign_keys = ON`。领域模块不碰 client / pragma。
6. **Isolate 连接串**：`SHUKKA_DB_URL`（可选 `SHUKKA_DB_AUTH_TOKEN`）。本 issue 不接 D1，也不把它们写成自托管安装合同。
7. **领域层**：`await` 查询构建器（不用 `.run()` / `.get()` / `.all()`）；事务是一个 `async (tx) => { ... }` 块。

## Alternatives

- **继续 better-sqlite3**：Node 最省事，Docker/Alpine/Workers 继续打架。
- **两套 ORM（sqlite 同步 + 远程异步）**：双份调用风格，比双入口更糟。
- **手写 `process.env.CF` / `VERCEL`**：与已有 `std-env` 检测分叉。
- **静态 import 原生客户端再 tree-shake**：打包器仍可能把 native 追进 Worker 图。
- **Postgres**：能上多实例，违背单文件自托管假设，产品排除。

## Trade-offs & failure bounds

- 全库调用改为 async：路由与测试都要 `await`。可读性靠少 await 无关行、事务保持一块来守。
- isolate 路径若未设 `SHUKKA_DB_URL` 会在建连时失败；本 issue 不交付这条运行时。
- `file:` 仍是单写者。多进程抢同一文件会损坏数据库，与换驱动前相同。
- migrator 用 `node:fs`，所以必须动态 import，且只在 Node 走。
