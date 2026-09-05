---
title: Litestream 复制
description: Litestream 把 SQLite 复制到对象存储并在启动时恢复，让 FaaS 等无持久盘环境也能部署 Shukka。
---

Litestream 把本地 SQLite 持续复制到 S3 兼容对象存储，容器启动时再按需要从副本恢复——因此没有持久盘的环境（FaaS、CloudBase CloudRun 这类容器平台）也能部署 Shukka。公开镜像已内置 Litestream 与一份配置（[`deploy/litestream/litestream.yml`](https://github.com/shukka-app/shukka/blob/main/deploy/litestream/litestream.yml)、[`deploy/litestream/entrypoint.sh`](https://github.com/shukka-app/shukka/blob/main/deploy/litestream/entrypoint.sh)）：设 `LITESTREAM_BUCKET` 即启用，不设就是普通本地盘模式。有持久卷的 VPS 不需要它——直接挂卷，见 [自托管部署](/zh-CN/docs/deployment)。

## 环境变量

在 [自托管部署](/zh-CN/docs/deployment) 的变量之外，这条路径多读这些：

| 变量 | 默认 | 用途 |
|------|------|------|
| `LITESTREAM_BUCKET` | 未设 | 复制开关兼副本 bucket。不设则纯本地盘模式 |
| `LITESTREAM_PATH` | 未设 | bucket 内的副本路径 |
| `LITESTREAM_ENDPOINT` | 未设 | 非 AWS 的 S3 兼容 endpoint（R2、COS 等）；AWS S3 留空 |
| `LITESTREAM_REGION` | 未设 | bucket 区域；R2 填 `auto` |
| `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` | 未设 | 副本存储凭证。也认 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`，`LITESTREAM_` 优先 |
| `SHUKKA_ENCRYPTION_KEY` | 未设 | 这条路径上**必填**，见下文 |

两个必须知道的坑：

- 复制的只有数据库文件（`SHUKKA_DB_PATH`，默认 `/data/shukka.db`），**`encryption.key` 不在其中**——所以这条路径必须设 `SHUKKA_ENCRYPTION_KEY`（64 位 hex，`openssl rand -hex 32`），否则冷启动会生成新密钥，已存的 S3 secret 全部解不开。
- SQLite 是单写者：实例数必须为 1（CloudRun 把最大实例数设为 1）。两个实例同时复制同一个 bucket 路径会互相破坏副本。

## 部署

通用 Docker 形态（以 R2 为例）：

```bash
docker run -d --name shukka --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e LITESTREAM_BUCKET=shukka-db \
  -e LITESTREAM_PATH=shukka.db \
  -e LITESTREAM_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  -e LITESTREAM_REGION=auto \
  -e LITESTREAM_ACCESS_KEY_ID=... \
  -e LITESTREAM_SECRET_ACCESS_KEY=... \
  -e SHUKKA_ENCRYPTION_KEY=<64 hex> \
  ghcr.io/shukka-app/shukka
```

CloudBase CloudRun 之类的容器平台：镜像选 `ghcr.io/shukka-app/shukka`，把上面的变量配成平台环境变量（凭证走平台的密钥管理），最大实例数 = 1，端口 3000，探活 `/api/health`。

## 注意

- 内置配置里 `force-path-style: false` 是为 COS 准备的（COS 拒绝 path-style 访问）；MinIO 等只认 path-style 的后端用不了这份配置，要挂一份自己的 `litestream.yml` 到 `/etc/litestream.yml`。
- 保留窗口走上游默认（`retention` 24h），要调整同样挂自定义配置。
- 冷启动时本地无库且副本存在会自动恢复；首次启动还没有副本，服务以空库起跑，之后的写开始复制。
