# ADR: 新建 app 向导——独立创建组件 + provider 预设纯展示层映射

## Status

Accepted.

## Context

单页长表单对首次配置的管理员不友好（见 `docs/prd/app-creation-wizard.md`）。同时 `AppForm` 被 `/apps/new` 与 Settings 编辑页共用：编辑页需要完整字段集和「secret 留空即保留」的语义，不适合为创建场景拆成多步。

## Decision

- 创建场景使用独立的向导组件（两步 + provider 选择）；Settings 编辑页继续用现有 `AppForm`，两者不共享表单实现。
- Provider 预设是纯展示层映射：选择 provider 只决定显示哪些字段、隐藏字段写入什么默认值，最终仍组装为现有 `AppFormValues` 提交。`appInputSchema`、数据库 schema 均不变，app 上不持久化 provider。
- 步骤状态只存在于客户端内存；最后一步一次 POST 完成创建，无草稿、无部分创建。
- 本特性为纯展示层变更，不改变任何可观测契约（API、错误码、落库行为均不变），因此 `docs/spec.md` 不更新。

## Alternatives

- **保留一个长表单、加分区标题**：实现最省，但首屏仍面对全部字段，「我这个厂商该填什么」的问题没有解决。
- **三步向导**（名称/slug → 选 provider → S3 字段）：provider 选择与字段展示之间没有需要分隔的校验边界，多一次翻页只增加点击。
- **在 app 上持久化 provider**：能让编辑页也按 provider 裁剪字段，但 provider 只是填写时的引导——保存后用户可自由改 endpoint/region，持久化会制造「所存 provider 与实际字段不一致」的新状态。

## Trade-offs & failure bounds

- 两份表单实现（创建向导 vs 设置编辑页）需要保持同步：S3 字段集合变化时两处都要改。
- Provider 预设值（R2 的 region `auto`、MinIO / JuiceFS 的 region `us-east-1` + path-style、AWS 的 null endpoint、Aliyun OSS 的 `https://{bucket}.oss-{region}.aliyuncs.com` + 强制 path-style）是约定俗成的默认值；厂商行为变化时需人工复核预设。
- Aliyun OSS 的 endpoint 已含 bucket 主机名。`s3ObjectUrl` 在 path-style 下若发现 host 已是 `{bucket}.…`，不再把 bucket 拼进 path，否则对象会落到 `{bucket}/{key}`。Settings 编辑页仍是完整表单，用户改掉这两项即失去该保护。
- 服务端错误到步骤的映射依赖现有固定错误码集（`conflict` / `invalid_request` / `storage_error`）；未来新增错误码时需显式决定归属步骤。
