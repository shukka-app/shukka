# PRD: Tauri Integration — Shukka 填 URL，其余由使用者按官方文档填写

**Status: accepted.** 质问来源：[issue #26](https://github.com/shukka-app/shukka/issues/26)。

## Problem

真实本机 E2E（Shukka + 官方 `create-tauri-app` + `tauri add updater` + 两份 AppImage）表明：只把 `plugins.updater.endpoints` 印在 Integration 上，不足以让 plugin-updater 跑起来。签名、公钥、updater 产物、HTTP 例外、capability 都是 **Tauri / 使用者** 的责任，不是 Shukka 的。读者会误以为「复制这段 JSON 就能更新」。

## Users

- **管理员 / 开发者**：在面板 Integration 或 README 里对照「Shukka 填什么 / 我填什么」，按官方 Tauri 文档补齐配置后发布。
- **编码 agent**：读 Integration 的 agent prompt，只改 endpoints，并把密钥 / pubkey / HTTPS 标成人工步骤。
- **终端应用**：仍由 plugin-updater 读公开 feed；安装行为属于客户端与操作系统。

## Goals

1. Integration 与 README 能一眼分清：哪个 URL 由 Shukka 填入，哪些键必须从官方 Tauri 文档自行填写。
2. 不发明 Shukka 专用的签名或打包替代物；占位与注释指向官方流程。
3. HTTP 本机（无 TLS）被点名；生产默认建议 HTTPS。`dangerousInsecureTransportProtocol` 是使用者写在 tauri.conf 里的开关，不是 Shukka 服务端开关。
4. Linux AppImage 写明：check + download 对 feed 成立；安装替换正在运行的 AppImage，受 FUSE / 挂载点约束；失败属 plugin-updater + 环境。Shukka 不声称完成安装，也不做 install e2e。
5. Electron Integration 行为不变（除非共享的发布文案必须改——本功能不改）。

## Non-goals

- 真实 Tauri `install` e2e（明确跳过）。
- 改 feed JSON 形状、上传器、`inferFeedTarget`、draft/release 默认。
- 在服务端生成或托管 Tauri 签名密钥。
- 把 `pubkey` 收成文件路径或由 Shukka 代填。
- 为 extract-and-run / overlay / 容器提供 Shukka 侧 workaround。

## Ownership

### Shukka owns

- Channel feed URL：`/api/update/{app}/{channel}` 与 `.../latest.json`。
- 对已发布版本提供静态 updater JSON（制品 URL 改写到本 feed，`.sig` 正文内联）。
- 上传 / finalize 整个 updater 产物目录。

### User owns（必须在 Integration / README 标成 “you fill these; not Shukka”）

- `tauri signer generate` 与构建时的 `TAURI_SIGNING_PRIVATE_KEY`。
- `plugins.updater.pubkey`（必填公钥**字符串**，不能是文件路径）。
- `bundle.createUpdaterArtifacts: true`（否则没有 `.sig`）。
- `dangerousInsecureTransportProtocol: true` **仅当** feed 是 HTTP（本机 / 无 TLS）。生产用 HTTPS，省略该键。
- `updater:default` capability（`tauri add updater` 通常会加）。
- `downloadAndInstall()` 之后可选的 `relaunch()`（官方 Tauri 文档）。

## Linux AppImage

AppImage 自动更新**不是**「Shukka 坏了」。对真实 1.0.0 → 1.1.0 配对，feed check、制品 302、minisign 下载可以成功（`metadataHits` / `artifactHits` 递增）。随后 `downloadAndInstall()` 在 `--appimage-extract-and-run` + overlay 上会以 Tauri 的 `temp directory is not on the same mount point as the AppImage` 失败。

必须写明：

- Linux updater 替换的是**正在运行的 AppImage 文件**。使用者必须跑真实 AppImage（FUSE），不能跑解压后的目录。
- 临时目录与 AppImage 必须同一挂载（`st_dev`）。容器 / overlay / extract-and-run 经常失败——这是 plugin-updater + 环境，不是 feed。
- Shukka **不加** install e2e。

## Flows

### 开发者：接入 Tauri app

1. 创建 `updaterKind: tauri` 的 app，打开 Integration。
2. 把 Shukka 填好的 `endpoints` 写入 tauri.conf。
3. 按官方文档生成签名密钥、写入 `pubkey`、打开 `createUpdaterArtifacts`、确认 capability；feed 为 HTTP 时才加 insecure 标志。
4. 构建并上传 updater 产物目录（含 `.sig`）。
5. 已发布版本上，客户端 `check()` + `downloadAndInstall()`；Linux 安装另受环境约束。

### 运维：HTTP vs HTTPS

见 `docs/prd/deploy.md`。生产反代终结 TLS；本机 HTTP 由使用者在 tauri.conf 打开 `dangerousInsecureTransportProtocol`，Shukka 不代开。

## User-visible states

- Integration 01：Tauri `builderConfig` 同时展示 `endpoints`（Shukka 填入的 URL）以及 pubkey / createUpdaterArtifacts / HTTP 标志的注释或占位，并标成使用者填写。
- Integration 02：`check()` / `downloadAndInstall()`；`relaunch()` 标成可选。
- Integration 文案与 agent prompt 列出仍须人工完成的步骤（密钥、pubkey、HTTPS）。
- Linux AppImage 约束出现在 Integration 与 README，不出现在 Electron 文案。

## Acceptance criteria

- [ ] 读 Integration 的人能分清：哪些 JSON 键要从 Tauri 复制/自填，哪个 URL 由 Shukka 填入。
- [ ] HTTP localhost 被点名；生产 HTTPS 是默认建议。
- [ ] AppImage 安装约束写下来；不声称 Shukka 安装 AppImage。
- [ ] Electron Integration 行为不变（除必须改动的共享发布文案——本功能不改共享发布文案）。

## Resolved product decisions

- 质问以 issue #26 正文为已完成结论，不再发明签名/打包替代。
- 所有权拆分写在 Integration、README 与本 PRD；adapter ADR 记录「文档不越界」。
- HTTP 标志是部署约束，交叉引用 `docs/prd/deploy.md`。
- 不做 AppImage install e2e。
