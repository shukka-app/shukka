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

## Non-goals

- 一个 App 混两种协议。
- Settings 里改 kind。
- 服务端替 Tauri 判断「有没有更新」（动态 204）。
- 改写 Electron yml。
- Sparkle 等第三种客户端（接口预留）。

## Flows

### 创建

1. 选 Electron 或 Tauri → 填名称（slug 自动生成，除非已手改）→ 下一步。
2. 选存储 → Release log → 提交，kind 随 app 入库。
3. 打开 Integration，只看到该 kind 的文档。

### 发布 / 更新

- Electron：builder 目录，`latest*.yml` 透传，制品 302。
- Tauri：bundle 下成对的制品 + `.sig`（可带 `latest.json`，官方 `tauri build` 默认不写）；feed 给出静态 `platforms` JSON，`url` 指向本 feed 下的制品，`signature` 为 `.sig` 正文。Action/CLI 的收集与版本推断见 `docs/prd/adapter-upload.md`。

## Acceptance criteria

- [x] 向导第一步有 Electron / Tauri 图标按钮；未选不能进入第二步。
- [x] 未手改 slug 时，中文名变成拼音 slug，英文名变成 kebab-case；手改过后不再覆盖。
- [x] 创建请求带 `updaterKind`；省略时 API 默认 `electron`（兼容已有脚本）。
- [x] Integration 随 app.kind 切换；Settings 无该字段。
- [x] Electron app 的 feed / 上传 / e2e 行为不变。
- [x] Tauri app 的 feed 在 `/api/update/{slug}/{channel}` 或 `.../latest.json` 返回静态 JSON；制品仍 302。
- [ ] 真实 Tauri 进程对已发布版本 check + download + minisign 成功；draft 对 updater 不可见。

## Resolved product decisions

- kind 绑在 App 上，创建时选定。
- 向导第一步与名称同一屏，不单独成步、不预选。
- S3 provider 仍不落库；updater kind 落库。
