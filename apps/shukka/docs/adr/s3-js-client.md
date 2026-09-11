# ADR: 用 aws4fetch 替代 @aws-sdk/client-s3

## Status

Accepted.

## Context

`src/lib/storage.ts` 只用 presigned PUT/GET、Head、Get 文本、Delete、写探测。AWS SDK 为 Node 凭证链和完整 S3 面打包过大。见 `docs/prd/s3-js-client.md`。

## Decision

1. 用 **`aws4fetch`**（`AwsClient`，fetch + Web Crypto SigV4）。不手写五类调用的签名。
2. 自己拼对象 URL：无 endpoint 走 `https://{bucket}.s3.{region}.amazonaws.com/{key}`；`forcePathStyle` 走 `{endpoint}/{bucket}/{key}`（无自定义 endpoint 时主机为 `s3.{region}.amazonaws.com`）；自定义 endpoint 且非 path-style 走 `{bucket}.{endpoint}/{key}`。保留 endpoint 的 http/https。
3. Presign：`signQuery`。S3 下 aws4fetch 默认 `UNSIGNED-PAYLOAD`，CI PUT 不必匹配 body hash。`X-Amz-Expires=3600` 写进 query，覆盖库默认的 86400。
4. 服务端 Head/Get/Delete/Put 走 `AwsClient.fetch`。404 Head → `null`（与 SDK `NotFound` 相同）。`isS3NotFound` 仍认旧 SDK 形状，外加 `status === 404` / `Response`。
5. 不引入只谈 R2 或只谈 AWS virtual-host 的库。

## Alternatives

- **继续 AWS SDK**：Node 最省事，Worker 体积不可接受。
- **手写 SigV4**：少一个依赖，签名边角（编码、UNSIGNED-PAYLOAD、query 排序）容易错。
- **R2 专用绑定**：丢掉 MinIO / 通用 S3。

## Trade-offs & failure bounds

- 没有 SDK 的自动重试 / 校验和中间件。探测与 Head 失败仍是 `storage_error`。
- aws4fetch 默认 presign 86400 秒；必须显式设 3600，否则合同变。
- 未在本机拉起 MinIO 做集成（CI `s3` job 仍走真实 MinIO / JuiceFS）。
