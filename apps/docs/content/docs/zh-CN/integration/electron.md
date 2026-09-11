---
title: Electron（electron-updater）
description: 把 electron-updater 指到 Shukka 的 generic feed，上传整个 electron-builder 输出目录。
---

## 接入

每个 channel 的 feed base URL 为 `{server}/api/update/{appSlug}/{channel}`。把它写进 `electron-builder.yml` 的 generic provider：

```yaml
# electron-builder.yml
publish:
  provider: generic
  url: https://updates.example.com/api/update/my-app/stable
```

app 详情的 **Integration** 标签页会给出填好真实 URL 的配置片段。客户端配置里**不需要任何凭证**——feed 公开是设计如此。

## Feed 行为

- electron-updater 默认请求 `latest.yml` / `latest-mac.yml` / `latest-linux.yml`；Shukka 返回当前**已发布**版本中同名 yml 的原文，一个字节都不改写。
- 请求制品文件名时 302 到短时效 S3 URL，客户端直连 S3 下载。
- draft 版本的文件名与不存在相同，返回 404。
- 把 Shukka channel 名写进 electron-builder 的 `publish.channel` 会让客户端改而请求 `{channel}.yml`（如 `stable.yml`）——除非产物里真有这些文件，否则不要设置。

## 发布

上传**整个** electron-builder 输出目录：安装包、`.blockmap` 文件、以及每一个 `latest*.yml`。Shukka 按 yml 原文回供，缺某个平台的 yml 意味着该平台永远静默地看不到更新。版本号默认从目录内 yml 的 `version` 字段读取。

用 [GitHub Action 或上传脚本](/zh-CN/docs/ci) 发布，不要手写上传协议。

## 排查「客户端收不到更新」

按从 feed 到客户端的顺序排查：

1. `curl -s "$SHUKKA_URL/api/update/{app}/{channel}/latest.yml"` —— 404 说明 channel 没有当前版本（还是 draft？），或该平台的 yml 根本没传上来。macOS 读 `latest-mac.yml`，Linux 读 `latest-linux.yml`。
2. 比较响应里的 `version` 与已装版本——electron-updater 只对严格更新的版本给出提示。
3. `curl -sI "$SHUKKA_URL/api/update/{app}/{channel}/{安装包文件名}"` —— 期望 302；404 说明 yml 里写的安装包不在这次上传里。
4. 在面板检查 channel 的当前版本——可能有人回滚了指针。
