# PRD: `sdk` 应用类型（自带更新逻辑）

## Problem

Shukka 支持的三类 updater（Electron / Tauri / Sparkle）都要求特定元数据文件。还有一类应用：
更新逻辑自己写，只需要 Shukka 存构建产物并提供“当前版本是什么、有哪些文件”的公开数据。
公开 release 清单已经提供了读取侧，但应用创建、上传校验与集成面板没有对应的类型：

- 上传被拒（缺少 `latest*.yml` / `latest.json` / `appcast.xml`）；
- 集成面板展示无关的 updater 配置；
- 列表与详情无法表达“这不是 updater 应用”。

## Users

- 自研更新器的桌面应用开发者（Electron/Tauri 之外的技术栈，或完全自写的下载/安装流程）；
- 想用 `@shukka/sdk` 或直接 HTTP 读取版本信息的团队。

## Goals

- 创建应用时可选择 `SDK`，kind 持久化，列表与详情正确展示。
- 上传任意构建产物即可发版：不需要、也不推断元数据；版本由调用方显式给出。
- 集成面板只展示 SDK 用法（安装、读取清单、文件 URL），不出现任何 updater 协议说明。
- 公开 release 清单是读取当前版本的唯一入口；feed 仍可按文件名 302 下载制品。

## Non-goals

- 不实现版本比较、下载、校验或安装逻辑；
- 不新增 feed 文档格式，不生成“通用 updater”协议；
- 不让 kind 创建后修改；
- 不改变 Electron / Tauri / Sparkle 的既有行为。

## Flow

1. 创建向导第一步选 `SDK`，填名称 / slug，后续存储与 release log 步骤不变。
2. Integration 面板展示：安装 `@shukka/sdk` → `getChannelRelease` 读取 `{version, releasedAt, files}` →
   按 `file.url` 下载（302 到存储）。
3. 发布：GitHub Action 传 `updater-kind: sdk` 与显式 `version`（或 HTTP 上传时在 init 里给 `version`），
   `release: true` 立即上线；否则是草稿。
4. 应用读取 `/api/v1/apps/{appSlug}/channels/{channel}/release`，自行比较版本并下载。

## Acceptance criteria

- `POST /api/v1/apps` 接受 `updaterKind: "sdk"`；`GET /api/v1/apps/{slug}` 原样返回。
- 对 `sdk` app，`upload/init` 不要求元数据文件；不按文件名过滤或分类 —— `builder-debug.yml`、
  `notes.json` 等文件也照常上传。
- finalize 后 feed 对这些文件名一律 302；不返回文档。
- uploader：`updater-kind: sdk` 被接受；扁平目录下除点文件外的全部文件都会上传；缺 `version`
  时报错并点名 `version` / `SHUKKA_VERSION`。
- Integration 面板与 agent prompt 对 `sdk` 只出现 SDK / release 清单内容。
- 现有 Electron / Tauri / Sparkle 测试全部保持通过。
