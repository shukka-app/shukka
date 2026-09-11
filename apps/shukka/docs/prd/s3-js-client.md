# PRD: 更小的 JS S3 客户端

## Problem

`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 带一整棵 Node 凭证链，对当前 Nitro Node 能用，但对日后 Worker / 体积敏感的打包太大。Shukka 只用很小一片 S3。

## Users

- **进程 / 打包**：运行时图更小。
- **运维**：S3 合同不变（AWS / R2 / MinIO / 其它兼容实现，path-style）。

## Goals

1. 换掉 AWS SDK，改用小的 fetch + SigV4 实现。
2. 保持现有合同：presigned PUT/GET（1h）、Head、Get text、Delete、Put+Delete 探测、path-style、对象键布局、制品字节不经 Shukka。
3. 运行时图里不再有 `@aws-sdk/client-s3`。

## Non-goals

- 改 presign TTL 或对象键。
- 在本 issue 上 Cloudflare 运行时。
- 只支持 R2 或只支持 AWS virtual-host 的库。

## Acceptance criteria

- [x] 锁文件 / 体积：AWS SDK 树（约 13MB `@aws-sdk` + 8MB `@smithy`）换成 `aws4fetch`（约 88KB）。本仓库还没有 Worker bundle，不在本 issue 造一个。
- [x] 现有 storage / 上传测试仍过；path-style 与 virtual-host URL 有单测。
- [x] 运行时依赖无 `@aws-sdk/client-s3`。
