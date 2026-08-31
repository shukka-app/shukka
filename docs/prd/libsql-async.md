# PRD: SQLite 驱动换成 libsql（异步）

## Problem

元数据已经在 SQLite + Drizzle（同一 schema、启动 migrate、单文件）。驱动是 `better-sqlite3`：原生绑定在 Docker / Alpine / 无 Node 文件系统的 isolate 上都会打架。领域层全是同步调用。要把自托管和日后远程/HTTP 收进同一 SQL 方言，必须换驱动，调用也必须改成异步。产品合同不变。

## Users

- **运维 / 已有 Docker / VPS 实例**：仍是一个进程、文件 SQLite、启动 migrate。不再需要为本机编译 `better-sqlite3`。
- **进程 / 打包**：运行时图不再含 `better-sqlite3`；isolate 路径不拉原生入口。

## Goals

1. 换掉 `better-sqlite3`，改用 `@libsql/client` + `drizzle-orm/libsql`。
2. 自托管仍是：单进程、`file:` SQLite、启动时对 `./drizzle` migrate（目录不存在则跳过，与今天相同）。
3. 适配器用 `std-env` 选择，且只 `import()`：Node 用原生入口，其它用 `@libsql/client/web`。
4. isolate 内不 `migrate('./drizzle')`。
5. 现有测试仍过；领域层可读，不把驱动类型漏进 `src/server/`。

## Non-goals

- Postgres。
- 改 feed 命中语义（云 isolate 仍不写计数，见 [feed-hits-serverless](feed-hits-serverless.md)）。
- 本 issue 交付 serverless 运行时 / wrangler / D1。
- 改 schema、迁移文件、或对外 HTTP 合同。

## Flows

### 运维：Docker / 源码自托管

1. 与今天一样启动进程；cwd 下有 `drizzle/` 则自动 migrate。
2. 数据仍在 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` 的单文件库。
3. 面板、上传、feed、health 行为不变。

### 进程：云 isolate（未交付）

1. `std-env` 判定非 `runtime === "node"` 时动态加载 web 客户端。
2. 不在 isolate 内跑 migrator。schema 由日后 wrangler / Turso 路径施加。

## Acceptance criteria

- [x] `package.json` / Docker 说明里不再有 `better-sqlite3`（drizzle-orm / nitro 的 optional peer 仍会出现在 lockfile 的 peer 列表里）。
- [x] 自托管：一进程、`file:` SQLite、启动 migrate、现有单测绿。
- [x] 没有剩余的同步 Drizzle sqlite 调用。
- [x] 适配器用 `std-env` + 动态 `import()`；Worker 路径不拉 `@libsql/client` 原生入口。
- [x] `src/server/` 与 `src/lib/auth.ts` 经过可读性复审：事务仍是一块，不把 `.run()` / `pragma` 漏进领域模块。

## Exclusions and resolved product decisions

- 同一 SQL 方言，两个动态入口，不是两套 ORM。
- 运行时检测复用已有 `src/lib/runtime.ts` / `std-env`，不发明 `process.env.CF`。
- 产品可见合同（setup、登录、发版、feed、health）不因驱动更换而变。
