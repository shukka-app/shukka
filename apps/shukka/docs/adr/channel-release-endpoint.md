# ADR: 非 updater 客户端使用独立的公开 release 接口

## Status

Accepted.

## Context

需要让不接任何 updater 的客户端拿到“当前版本 + 文件列表”。当时可用的公开读面只有：

- `/api/update/{appSlug}/{channel}[/{filename}]`：文档格式由 app 的 `updaterKind` 决定（Electron yml、Tauri JSON、Sparkle appcast），制品通过 302 下载。
- `/api/v1/apps/{appSlug}/channels/{channel}/notes`：只有 release notes。

`GET /api/v1/apps/{appSlug}` 需要 API key 或 session，且 key 带有修改 app 的权限，不能下发给终端客户端。

## Decision

1. **新增一个公开 operation**：`GET /api/v1/apps/{appSlug}/channels/{channel}/release`，返回 `{ version, releasedAt, files: [{ filename, size, url }] }`，`security: []`，`cache-control: no-store`。
2. **不引入新的 `updaterKind`**。`updaterKind` 在创建时固定，同时驱动上传校验、面板文案和 feed 文档生成；为“没有 updater”造一个 kind，等于让服务端生成一份客户端并不想要的协议文档，还把未来的客户端绑死在 feed 路由上。
3. **不改 `TauriFeed`，也不给 feed 加 union**。见下节。
4. **文件 URL 复用 feed**：`url = {origin}/api/update/{appSlug}/{channel}/{filename}`（文件名 URL 编码）。下载因此与 feed 共用 302 预签名、draft≡404 与命中计数规则，不新增一条下载路径。
5. **只列 `kind: artifact` 的制品**，按文件名排序。yml / `latest.json` / appcast.xml / `.sig` 是 updater 协议的一部分，非 updater 客户端不需要，也不应该被迫处理。
6. **当前版本解析与 feed 相同**：`getAppBySlug` → `getChannel` → `currentVersionId` → 版本必须已有 `releasedAt`，否则 404。
7. **契约落地**：`channelReleaseResponseSchema`（Zod）→ `ChannelRelease` component → `operation(t, 'getChannelRelease')`，en / zh 叙事各一条；3.0.3 快照由现有 schema walk 自动得到。

## Alternatives

- **给 feed 响应加 `oneOf: [TauriFeed, ReleaseManifest]`**：生成器对 `oneOf` 的处理不一致。dart-dio 会生成 `OneOf` wrapper 并要求引入 `one_of` 包；progenitor 生成 untagged enum；Swift 生成带 optional 的 enum。这些都会污染现有四门语言的 SDK，而它们的调用方并不关心新形状。同时会让现有 feed 读方在契约上面对一个可能不是 updater 文档的响应。拒绝。
- **把 release 清单塞进 `TauriFeed`**：字段与语义都属于另一个协议，且 Electron / Sparkle 的调用方会看到一个与自己的 feed 无关的新形状。拒绝。
- **复用 `/api/v1/apps/{appSlug}`**：需要 API key；key 的权限面包含写操作。拒绝。
- **让客户端解析 updater 文档**：等于要求每个非 updater 客户端实现一种它并不使用的协议，且格式随 kind 变化。拒绝。

## Trade-offs & failure bounds

- 现在有三处公开读面各自解析“当前已发布版本”（feed、public notes、release）。逻辑短且集中在 `server/` 下的独立模块，但语义漂移是真实风险：三处的 404 条件必须保持一致（当前版本存在且 `releasedAt` 非空）。测试覆盖了 draft / 空 channel / 不存在三种情况。
- 文件 URL 指向 feed 而不是直链 S3：客户端必须跟随 302（所有 HTTP 客户端默认支持），换来的是下载权限、过期时间和命中统计只有一套实现。
- 接口读本身不计命中；只有随后的 302 计入，与 feed 的制品命中一致。
- `files` 将来若需要平台、架构、签名等元数据，只能以新增字段的方式加入；现有字段的含义（绝对 URL、basename）不再改变。
