---
title: Tauri（plugin-updater）
description: 把 tauri-plugin-updater 的 endpoints 指到 Shukka feed，上传签名后的 bundle 与 .sig。
---

## 接入

在 `tauri.conf.json` 里配置 updater 插件，`endpoints` 指向 channel 的 feed base URL：

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<tauri signer 公钥>",
      "endpoints": ["https://updates.example.com/api/update/my-app/stable"]
    }
  }
}
```

`pubkey` 来自 Tauri 签名密钥对：

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/my-app.key
```

私钥（`~/.tauri/my-app.key`）留在 CI 里给制品签名，公钥写进客户端配置。feed 本身无鉴权，客户端配置里不放任何凭证。

Tauri 生产客户端默认要求 HTTPS，endpoint 请用 `https://`。

## Feed 行为

`GET /api/update/{appSlug}/{channel}`（或 `.../latest.json`）返回为当前**已发布**版本生成的静态 updater JSON：`platforms` 映射里每个平台的 `url` 指向本 feed 下的制品（跟随 302 到 S3），`signature` 为对应 `.sig` 文件的正文。无当前版本时 404；draft 对 updater 不可见。

`latest.json` 里的绝对 `url` 按本次请求的 origin 生成。如果 Shukka 在反代之后且回源是 HTTP，feed 里可能出现 `http://` 的制品 URL——见[自托管部署的 TLS 一节](/docs/deployment#反向代理与-tls)。

## 发布

上传整个产物目录：各平台的 bundle（如 `.app.tar.gz`、`.AppImage`、`.exe` 等）加上每个制品对应的 `.sig` 签名文件；也可以带上构建生成的 `latest.json`。`.sig` 用私钥生成：

```bash
npx @tauri-apps/cli signer sign --private-key <私钥> --password <密码> <制品文件>
```

上传校验要求 `latest.json` 和 / 或成对的制品 + `.sig`；`latest.json` 里声明的 `version` 必须与上传版本一致（`.sig` 不声明 version，不做此项校验）。

Tauri 产物目录里没有 electron-builder 的 `latest*.yml`，所以版本号要显式传给发布工具：GitHub Action 的 `version` input，或上传脚本的 `SHUKKA_VERSION` 环境变量。详见 [CI 发布](/docs/ci)。
