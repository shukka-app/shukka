---
title: 应用与渠道
description: 创建 app（选 Electron / Tauri、配 S3）、管理 channel 与 feed URL。
---

## 创建应用

面板侧栏的「新建应用」打开创建向导：

1. **更新系统与名称**：选 Electron 或 Tauri（必选、不预选），填名称与 slug。名称未手改 slug 时，slug 由名称自动生成（中文名转拼音，英文名转 kebab-case）；一旦手动改过 slug 字段，就不再跟随名称。**更新系统创建后不可修改**，Settings 里也不出现该字段。
2. **存储**：填 S3 配置（见下）。保存前服务端始终做一次写探测（Put + Delete 探针对象），失败拒绝保存，不落库半成品。
3. **Release log**：配置发布日志的启用开关、locale 列表与回退 locale（详见[发布日志](/docs/guide/release-notes)）。

创建后 app 自带一个 `stable` channel。

## S3 配置

每个 app 独立一套：endpoint、region、bucket、prefix、access key、secret、force path style。Secret 加密落库（密钥在 Shukka 数据目录里），不回显。

| 厂商 | 要点 |
|------|------|
| AWS S3 | endpoint 留空；region 为真实区域 |
| Cloudflare R2 | endpoint 为 R2 S3 API；region `auto` |
| MinIO | 填 endpoint，强制 path-style |
| 其他兼容实现 | 按对方文档；多数要 path-style |

网络要求：CI 与桌面客户端必须能访问该 endpoint（上传 PUT、下载跟 302），Shukka 主机必须能 Head/Get/Delete。详见[自托管部署](/docs/deployment#对象存储)。

## Channel

Channel 是 app 下的发布通道，任一时刻指向至多一个**已发布**的当前版本。

- 名称是 URL token，必须匹配 `^[a-z0-9][a-z0-9_-]{0,62}$`（小写字母、数字、连字符、下划线），创建时校验。
- 可增删。删除 channel 会同时删掉它拥有的 S3 对象，不可撤销。
- 每个 channel 一条公开 feed，base URL 为 `{server}/api/update/{appSlug}/{channel}`，在 app 详情的 Channels / Integration 标签页可复制。

对外标识只有自然键：app slug、channel 名、version 字符串；API 与面板路由都不暴露数字 id。
