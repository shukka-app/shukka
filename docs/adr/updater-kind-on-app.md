# ADR: App.updaterKind + 每协议一个 adapter

## Context

内核（draft / current / S3 / key）与协议无关。焊死的是元数据形状、feed 应答、上传校验。Tauri 的 JSON 必须带绝对 URL 和 `.sig` 正文，不能沿用 Electron 的「原文透传」。

## Decision

1. `apps.updater_kind` 为 `electron` | `tauri`。已有行默认 `electron`。创建后不改。
2. `src/server/updaters/` 下每个 kind 一个 adapter：上传分类与校验、feed 文档怎么出、平台徽标怎么认。Action/CLI 侧每个 kind 另有一份零依赖收集/版本实现（`scripts/updaters/*.mjs`，见 `docs/adr/adapter-owned-uploader.md`），不 import 本目录。
3. Electron adapter：yml 原文透传；制品按文件名 302。
4. Tauri adapter：生成静态 `platforms` JSON（`url` 指向本 channel feed 下的制品，`signature` 读 `.sig`）；无 current 时 404。
5. 公开路径仍是 `/api/update/{app}/{channel}`；空 path 与 `latest.json` 由 Tauri adapter 解释为 manifest。
6. Integration snippet 在面板里按 `publicApp.updaterKind` 分支，不在 Settings 暴露。

## Alternatives

- **kind 绑 Channel**：同一 slug 下两套 feed，Integration 必须再选 channel 协议，拒绝。
- **统一生成所有协议的元数据**：要复刻 electron-builder yml，兼容风险高。

## Trade-offs & failure bounds

- 建错 kind 只能删 app 重建（尚无 version 时理论上可改，产品选择不做，避免 Settings 出现协议开关）。
- Tauri 平台键从文件名启发式推断；带官方 `latest.json` 时以其 `platforms` 键为准、只改写 url。
- 生产环境 Tauri 默认要求 HTTPS，属部署约束。
