# PRD: 更新系统 adapter——创建时选 Electron / Tauri，Integration 跟着变

**Status: shipped.**

## Problem

Shukka 的公开 feed、上传校验和接入文档都按 electron-updater 写死。要接 Tauri plugin-updater（以及以后别的客户端）时，不能把「yml 原文透传」当成全系统不变量，也不能让用户在接入页自己改协议。

## Users

- **管理员 / 开发者**：创建 app 时选这个应用用哪种更新客户端；之后只看见对得上的接入文档与上传规则。
- **CI**：仍上传整个产物目录；不必传协议名（Action/CLI 可从文件推断 kind，见 `docs/prd/adapter-upload.md`）。
- **终端应用**：Electron 或 Tauri 客户端按各自契约读 feed。

## Goals

1. 创建向导第一步用与 S3 provider 相同的带图标按钮选择更新系统（Electron / Tauri），必选、不预选，和名称 / slug 同一屏。
2. `updaterKind` 落在 App 上；创建时选定，之后不改；Settings 不出现该选择。
3. Integration（snippet、Agent 提示）按 kind 换内容，面板结构不变（01 / 02 / 03）。
4. 上传与 feed 按 kind 走对应 adapter。Electron 行为与现网一致。
5. 名称未手改 slug 时，用拼音 + GitHub Slugger 从 name 生成 slug；用户一旦改过 slug 字段，不再跟随 name。
6. 每种 adapter 自己把制品文件名映射为 feed target（或明确不做）。Tauri 无架构 Linux / Darwin 有文档化默认键；Electron 不推断。

## Non-goals

- 一个 App 混两种协议。
- Settings 里改 kind。
- 服务端替 Tauri 判断「有没有更新」（动态 204）。
- 改写 Electron yml。
- Sparkle 等第三种客户端（接口预留）。
- 上传器目录收集（collect / version 推断）。
- 无架构 Windows 文件名的默认 feed target。

## Flows

### 创建

1. 选 Electron 或 Tauri → 填名称（slug 自动生成，除非已手改）→ 下一步。
2. 选存储 → Release log → 提交，kind 随 app 入库。
3. 打开 Integration，只看到该 kind 的文档。

### 发布 / 更新

- Electron：builder 目录，`latest*.yml` 透传，制品 302。平台徽标读 yml 文件名（`latest.yml` / `latest-mac.yml` / `latest-linux.yml`）。文件名不映射为 feed 的 `platforms` 键。
- Tauri：bundle 下成对的制品 + `.sig`（可带 `latest.json`，官方 `tauri build` 默认不写）；feed 给出静态 `platforms` JSON，`url` 指向本 feed 下的制品，`signature` 为 `.sig` 正文。Action/CLI 的收集与版本推断见 `docs/prd/adapter-upload.md`。
- 未上传 `latest.json` 时，Tauri `platforms` 键由该 adapter 从制品文件名推断。无架构 token 的 `*.AppImage` / 文件名含 `linux` 默认为 `linux-x86_64`；无架构 token 的 `*.app.tar.gz` / 文件名含 `mac` 或 `darwin` 默认为 `darwin-x86_64`。显式 `aarch64` / `arm64` / `amd64` / `x64` / `x86_64` / `i686` / `armv7` 覆盖默认。Windows 无架构 token 时不产生键。
- 上传了 `latest.json` 时，其中声明的 `platforms` 键原样采用；启发式只填无 manifest 的路径。arm / universal 构建应上传 `latest.json` 或在文件名中写明架构。

## Acceptance criteria

- [x] 向导第一步有 Electron / Tauri 图标按钮；未选不能进入第二步。
- [x] 未手改 slug 时，中文名变成拼音 slug，英文名变成 kebab-case；手改过后不再覆盖。
- [x] 创建请求带 `updaterKind`；省略时 API 默认 `electron`（兼容已有脚本）。
- [x] Integration 随 app.kind 切换；Settings 无该字段。
- [x] Electron app 的 feed / 上传 / e2e 行为不变。
- [x] Tauri app 的 feed 在 `/api/update/{slug}/{channel}` 或 `.../latest.json` 返回静态 JSON；制品仍 302。
- [x] 无 `latest.json` 时，无架构的 `*.AppImage` 产生 `linux-x86_64`，无架构的 `*.app.tar.gz` 产生 `darwin-x86_64`。
- [x] 上传了 `latest.json` 时，声明的 `platforms` 键不被文件名启发式改写。
- [x] Electron 的 yml 透传与平台徽标规则不变；Electron 不为文件名推断 feed target。
- [x] 面板平台徽标经该 app 的 adapter（`updaterKind`）计算，不从通用 UI 路径直接调用 Tauri 专用文件名解析器。
- [ ] 真实 Tauri 进程对已发布版本 check + download + minisign 成功；draft 对 updater 不可见。

## Resolved product decisions

- kind 绑在 App 上，创建时选定。
- 向导第一步与名称同一屏，不单独成步、不预选。
- S3 provider 仍不落库；updater kind 落库。
- 文件名 → feed target 与面板徽章都属于该 kind 的 adapter，不设全局文件名解析器。
- Tauri 无架构默认键为 `linux-x86_64` 与 `darwin-x86_64`（对齐 Tauri 常见 `{{target}}-{{arch}}`）；arm / universal 须在文件名写架构或上传 `latest.json`。
