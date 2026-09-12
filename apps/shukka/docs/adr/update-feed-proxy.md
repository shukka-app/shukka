# ADR: 更新 feed 经 Shukka，元数据透传，制品 302

## Context

electron-updater（generic provider）按 feed base URL 请求 `{channel}.yml` / `{channel}-mac.yml` 等元数据，并按 yml 中的相对文件名请求制品。可选方案：客户端直连 S3，或经 Shukka endpoint。

## Decision

1. Feed 走 Shukka 无鉴权 endpoint：`/api/update/{appSlug}/{channel}` 为 base。Shukka 在链路上才能做下载计数和「channel 当前版本」原子切换。
2. yml 内容透传：electron-builder 产出的 `latest*.yml`（或自定义 channel 命名）原样存 S3、原样返回，Shukka 只解析不改写。兼容性以 electron-builder 为准，不追实现细节。
3. 制品请求返回 302 到 S3 presigned GET URL；Shukka 不中转字节。
4. yml 请求按「channel 当前版本」解析；制品文件名在 channel 内**已发布**版本中查找（文件名含版本号，天然唯一），避免版本切换瞬间 yml 与制品不一致，同时不泄露 draft。
5. 每次 yml 命中与制品 302 各计一次数，落到版本维度。

## Alternatives

- **客户端直连 S3**：Shukka 掉线不影响更新，但无计数、发版需要覆盖写 `latest.yml`（切版本非原子）、bucket 必须公网可读。
- **Shukka 生成 yml**：上传端更简单，但需复刻 electron-builder 的 sha512/blockmap 细节，兼容风险高。

## Trade-offs & failure bounds

- Shukka 成为更新链路单点：宕机期间客户端检查更新失败（electron-updater 静默重试语义），已安装应用不受影响。部署方自行决定可用性投入。
- presigned GET 有效期短（默认 1h 量级），yml 拉取与下载间隔超时会失败重试；可接受。
