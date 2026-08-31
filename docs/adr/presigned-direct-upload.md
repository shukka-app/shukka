# ADR: 版本上传走 presigned URL 直传

## Context

Electron 安装包单文件常达数百 MB，一次发版多平台多文件。上传方是 CI。

## Decision

三段式上传协议，制品字节不经过 Shukka：

1. `POST /api/v1/upload/init`（Bearer API key）：携带 channel、version、文件清单；Shukka 校验权限与版本唯一性，创建 pending upload 记录，为每个文件签发 S3 presigned PUT URL（签名实现见 [s3-js-client](s3-js-client.md)）。
2. 客户端逐文件 PUT 直传 S3，key 布局 `{prefix}/{channel}/{version}/{filename}`。
3. `POST /api/v1/upload/finalize`：Shukka HeadObject 逐一校验对象存在与大小，读取并解析 yml，创建版本与文件记录。默认 draft，不切 current；仅 `release: true` 时原子切换 channel 当前版本（见 `docs/adr/draft-released-at.md`）。

未 finalize 的 pending upload 过期作废；期间 feed 不受影响。

## Alternatives

- **经 Shukka 流式转存**：客户端一个端点搞定，但大文件吃服务带宽与连接时长，自托管小机器易成瓶颈。
- **双模式**：实现与文档翻倍，v1 不做。

## Trade-offs & failure bounds

- 需要 S3 兼容实现支持 presigned PUT（AWS/R2/MinIO 均支持）。
- 直传失败重试由上传脚本负责；finalize 校验兜底，不会出现「记录存在但对象缺失」的版本。
- 超大文件不做 multipart 分片，单 PUT 上限以 S3 实现为准（AWS 5GB），覆盖 Electron 场景。
