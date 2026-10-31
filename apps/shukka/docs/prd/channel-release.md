# PRD: 非 updater 客户端的 release 清单

## 问题

Shukka 的公开读面只有两条：按 `updaterKind` 生成的上游更新文档（Electron yml、Tauri `latest.json`、Sparkle appcast）和公开 release notes。前者是更新协议的一部分，格式由 app 创建时固定的 kind 决定；后者只有说明文字。

不使用任何 updater 的客户端——移动端、嵌入式设备、自写安装器——既拿不到“当前最新版本是哪个”，也拿不到“这个版本有哪些文件”，只能去解析某个更新协议的文档，或者在有 API key 的情况下调用 App API（而 key 能改 app，不能下发给终端）。

## 用户

- 给自家 app 接入 Shukka 的集成者：客户端不是 Electron / Tauri / Sparkle，也不需要自动更新，只想检查版本并自己选文件下载。
- 后续的客户端 SDK（各语言）：需要一个与 updater 解耦、稳定的契约来生成方法。

## 目标

1. 一个公开、无鉴权的 JSON 接口，返回 channel 当前已发布版本：版本号、发布时间、可下载文件列表。
2. 文件列表只包含用户要下载的制品，不含 updater 元数据（yml / `latest.json` / appcast.xml / `.sig`）。
3. 下载与现有 feed 走同一条路径：同样的 302 短时效 URL、同样的命中统计。
4. 与 `updaterKind` 完全无关；不改变任何现有 updater 文档。
5. 进入 OpenAPI 契约（含 3.0.3 快照），生成 SDK 时是一个普通 operation。

## 非目标

- 不新增 `updaterKind`，不提供通用 updater 协议。
- 不做客户端侧版本比较或平台筛选：接口只给出全部制品，选择由客户端完成。
- 不暴露 draft；不提供历史版本列表（release notes 已覆盖文字说明，版本历史留给 App API）。
- 不替代 feed：需要签名、appcast、yml 的场景仍用 feed。

## 流程

1. 客户端 `GET /api/v1/apps/{appSlug}/channels/{channel}/release`。
2. 响应 `{ version, releasedAt, files: [{ filename, size, url }] }`。
3. 客户端比较 `version` 与本地版本，不同则从 `files` 中选择需要的文件。
4. 下载 `url`；服务端 302 到短时效 S3 URL。

## 验收标准

- 已发布 1.0.0 的 Electron app，接口返回 `version: "1.0.0"`、`releasedAt` 为 Unix 秒、`files` 只含安装包（不含 `latest.yml`）。
- 未鉴权请求成功；响应带 `cache-control: no-store`。
- 每个 `url` 为绝对地址 `{origin}/api/update/{appSlug}/{channel}/{filename}`，文件名按 URL 编码；请求该 URL 得到 302，并计入该版本的制品命中。
- channel 当前版本为 draft、channel 为空、app 或 channel 不存在 → 404，错误信封 `{ error: "not_found", message }`。
- 回滚（`PATCH currentVersion` 指向旧已发布版本）后，接口返回旧版本及其文件。
- Tauri / Sparkle app 返回同一形状；`apps` 的 `updaterKind` 不影响响应。
- 接口出现在 OpenAPI 3.1 与 3.0.3 快照中，operationId 为 `getChannelRelease`，`security: []`。
