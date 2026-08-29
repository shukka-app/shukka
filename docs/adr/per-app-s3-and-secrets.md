# ADR: S3 配置按 app 隔离，凭证加密落库

## Context

不同 app 可能用不同云厂商（AWS/R2/MinIO）。S3 secret key 需要持久化在服务端才能签 presigned URL。

## Decision

- 每个 app 独立保存 endpoint、region、bucket、key prefix、access key id、secret access key、force path style 开关。
- secret access key 用 AES-256-GCM 加密后存 SQLite。加密密钥默认首次启动自动生成，存数据目录 `data/`（与数据库同卷），不要求额外环境变量。运维也可改用 `SHUKKA_ENCRYPTION_KEY_FILEPATH` 或 `SHUKKA_ENCRYPTION_KEY` 二选一注入（见 [encryption-key-source](encryption-key-source.md)）。
- 创建/编辑 app 时做一次 S3 写探测（Put+Delete 一个探针对象），失败则拒绝保存；同一探测也经 `POST /api/admin/storage/test` 暴露给面板的「测试连接」按钮（不落库）。

## Alternatives

- **全局一套 S3 配置（环境变量）**：部署简单，但多 app 多厂商场景直接无解。
- **必填环境变量提供加密密钥**：更「十二要素」，但单管理员自托管里多一个必配项，忘配即起不来。自动生成仍是默认，把常见备份边界收敛为「整个 data 目录」。可选 env / filepath 留给 secret manager 与 systemd，见 [encryption-key-source](encryption-key-source.md)。

## Trade-offs & failure bounds

- 拿到 data 目录即拿到全部 S3 凭证——与 SQLite 本身的信任边界一致，不假装更安全。
- 换机器迁移：默认 / filepath 模式必须带上密钥文件；`SHUKKA_ENCRYPTION_KEY` 模式必须带上同一个值。文档写明。
