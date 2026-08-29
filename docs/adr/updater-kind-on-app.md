# ADR: App.updaterKind + 每协议一个 adapter

## Context

内核（draft / current / S3 / key）与协议无关。焊死的是元数据形状、feed 应答、上传校验。Tauri 的 JSON 必须带绝对 URL 和 `.sig` 正文，不能沿用 Electron 的「原文透传」。

## Decision

1. `apps.updater_kind` 为 `electron` | `tauri`。已有行默认 `electron`。创建后不改。
2. `src/server/updaters/` 下每个 kind 一个 adapter：上传分类与校验、feed 文档怎么出、文件名如何映射为 feed target、平台徽标怎么认。Action/CLI 侧每个 kind 另有一份零依赖收集/版本实现（`scripts/updaters/*.mjs`，见 `docs/adr/adapter-owned-uploader.md`），不 import 本目录。
3. `UpdateAdapter.inferFeedTarget(filename)` 把制品文件名映射为该协议的 feed target 键（或 `null`）。`platformsOf` 仍负责面板徽章。下一种 updater 不得再往 `src/lib/` 加全局文件名解析器。
4. Electron adapter：yml 原文透传；制品按文件名 302。`inferFeedTarget` 恒为 `null`（Electron feed 没有 `platforms` JSON）。`platformsOf` 继续只读 yml 文件名。
5. Tauri adapter：生成静态 `platforms` JSON（`url` 指向本 channel feed 下的制品，`signature` 读 `.sig`）；无 current 时 404。无 `latest.json` 时用 `inferFeedTarget` 填 `platforms` 键；有 `latest.json` 时声明键原样采用，只改写 `url` / 补 `signature`。
6. Tauri 启发式：显式 `aarch64` / `arm64` → `aarch64`；`i686` / `ia32` → `i686`；`armv7` → `armv7`；`amd64` / `x64` / `x86_64` → `x86_64`。OS 仍从 `darwin` / `mac` / `*.app.tar.gz`、`linux` / `appimage`、`win` / `nsis` / `msi` 识别。无架构时 Linux 默认 `linux-x86_64`、Darwin 默认 `darwin-x86_64`；Windows 无架构则 `null`。arm / universal 构建应上传 `latest.json` 或把架构写进文件名。
7. 公开路径仍是 `/api/update/{app}/{channel}`；空 path 与 `latest.json` 由 Tauri adapter 解释为 manifest。
8. Integration snippet 在面板里按 `publicApp.updaterKind` 分支，不在 Settings 暴露。
9. 面板徽章经 `adapterFor(updaterKind).platformsOf`，不从通用 UI 路径 import Tauri 专用 lib。
10. Tauri Integration **只填** `plugins.updater.endpoints`（channel 根 URL）。`pubkey`、`bundle.createUpdaterArtifacts`、HTTP 时的 `dangerousInsecureTransportProtocol` 以注释/占位出现，并标成 “you fill these; not Shukka”。签名（`tauri signer generate`、`TAURI_SIGNING_PRIVATE_KEY`）、`updater:default` capability、可选 `relaunch()` 同样是使用者按[官方 Tauri 文档](https://v2.tauri.app/plugin/updater/)填写。不发明 Shukka 替代签名或打包。
11. Linux AppImage：feed 的 check + download + minisign 是 Shukka 的责任面；`downloadAndInstall()` 替换正在运行的 AppImage，要求 FUSE 挂载且临时目录与 AppImage 同挂载。extract-and-run / overlay / 容器失败属 plugin-updater + 环境。不做 install e2e。见 [tauri-integration](../prd/tauri-integration.md)。

## Alternatives

- **kind 绑 Channel**：同一 slug 下两套 feed，Integration 必须再选 channel 协议，拒绝。
- **统一生成所有协议的元数据**：要复刻 electron-builder yml，兼容风险高。
- **全局 `src/lib/tauri-target.ts` 给 UI 与 adapter 共用**：下一种 updater 会再长一个全局解析器；拒绝。推断留在该 kind 的 adapter 上。
- **无架构时拒绝出键 / 默认 aarch64**：裸 `*.AppImage` 与 `*.app.tar.gz` 在官方 bundle 里常见，拒绝会让无 `latest.json` 的 feed 直接 404。默认 `x86_64` 对齐 Tauri 常见 `{{target}}-{{arch}}`；arm / universal 用 manifest 或文件名覆盖。
- **Shukka 代生成或托管 Tauri 签名密钥 / 代填 pubkey**：拒绝。密钥属于应用发布者；Integration 只指向官方 `tauri signer` 流程。
- **Integration 只印 endpoints**（本 ADR 落地时的原文）：真实 create-tauri-app E2E 证明不够，读者漏掉官方必填项。

## Trade-offs & failure bounds

- 建错 kind 只能删 app 重建（尚无 version 时理论上可改，产品选择不做，避免 Settings 出现协议开关）。
- Tauri 平台键在无 `latest.json` 时从文件名启发式推断（无架构 Linux / Darwin 默认 `*-x86_64`）；带官方 `latest.json` 时以其 `platforms` 键为准、只改写 url。
- 把无架构 Darwin 默认成 `darwin-x86_64` 会使 Apple Silicon / universal 在未声明时对不上客户端 target。产品选择要求这类构建上传 `latest.json` 或在文件名写 `aarch64` / `arm64`。
- 生产环境 Tauri 默认要求 HTTPS，属部署约束（[deploy](../prd/deploy.md)）。本机 HTTP feed 由使用者在 tauri.conf 打开 `dangerousInsecureTransportProtocol`；Shukka 不代开、不藏这个键。
- Integration 若只印 endpoints，读者会漏掉官方必填项；占位必须标明所有权，避免被当成可复制即用的完整配置。
