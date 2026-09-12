---
title: 应用与渠道
description: 创建 app（选 Electron / Tauri、配 S3）、管理 channel 与 feed URL。
---

## 创建应用

面板侧栏的「新建应用」打开创建向导：

1. **更新系统与名称**：选 Electron 或 Tauri（必选），填名称与 slug。更新系统创建后不可修改。
2. **存储**：填 S3 配置（见下）。保存前会做一次写测试，失败则不保存。
3. **Release log**：配置发布日志的启用开关、locale 列表与回退 locale（详见[发布日志](/zh-CN/docs/guide/release-notes)）。

创建后 app 自带一个 `stable` channel。

## S3 配置

每个 app 独立一套 S3 配置。Secret 加密存储，保存后不再显示。

| 厂商 | 要点 |
|------|------|
| AWS S3 | endpoint 留空；region 为真实区域 |
| Cloudflare R2 | endpoint 为 R2 S3 API；region `auto` |
| MinIO | 填 endpoint，强制 path-style |
| 其他兼容实现 | 按对方文档；多数要 path-style |

网络要求：CI 与桌面客户端必须能访问该 endpoint，Shukka 主机也必须能读写与删除对象。详见[自托管部署](/zh-CN/docs/deployment#对象存储)。

## Channel

Channel 是 app 下的发布通道，任一时刻指向至多一个**已发布**的当前版本。

- 名称只能用小写字母、数字、连字符与下划线，最长 63 字符，创建时校验。
- 可增删。删除 channel 会同时删掉它拥有的 S3 对象，不可撤销。
- 每个 channel 一条公开 feed，base URL 为 `{server}/api/update/{appSlug}/{channel}`，在 app 详情的 Channels / Integration 标签页可复制。
