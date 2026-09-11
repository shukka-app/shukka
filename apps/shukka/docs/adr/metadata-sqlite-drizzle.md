# ADR: 元数据用 SQLite + Drizzle

## Context

需要持久化 app、channel、版本、文件、API key、session、下载计数。制品本体在 S3。单管理员自托管，运维能力假设为「一个容器 + 一个卷」。

## Decision

SQLite 单文件数据库（数据目录 `data/`，可挂卷），Drizzle ORM 管 schema 与迁移，启动时自动迁移。

驱动是 libsql（`@libsql/client` + `drizzle-orm/libsql`），不是 `better-sqlite3`。入口按运行时动态选择：Node 用 `file:`，isolate 用 HTTP web 客户端。见 [libsql-async](libsql-async.md)。

## Alternatives

- **全部状态存 S3 JSON**：无额外存储，但并发写、计数自增、关联查询都要自造，得不偿失。
- **Postgres**：能力过剩，自托管多一个依赖进程。

## Trade-offs & failure bounds

- 单写者模型足够：写入方只有面板管理员与 CI finalize，QPS 极低；计数写入用 WAL 模式承载。
- 数据库文件损坏 = 丢失版本记录与 key，但 S3 制品与 yml 仍在；可接受，备份策略交给部署方（拷贝 `data/`）。
