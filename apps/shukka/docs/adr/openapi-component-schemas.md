# ADR: 请求/响应 schema 命名为 components.schemas

## Status

Accepted.

## Context

请求体和响应体此前都是内联 schema：`jsonResponse(描述, zodSchema)` 直接把 `z.toJSONSchema` 的结果塞进 operation。生成的 SDK 只能拿路由和状态码拼模型名——Dart 里是 `GetApp200Response`、`InitUpload200Response`，Swift 里整棵响应类型嵌在 `Operations.getApp.Output` 下。

模型名是 SDK 的公开 API。多语言 SDK 一旦发布，改名的成本随版本迅速上升，而这个名字本来可以一次定好。

## Decision

1. **`openapi.ts` 里维护一张 `schemas` 表**：24 个条目，用 `jsonSchema(zodSchema, io)` 生成后整体写进 `components.schemas`。`io` 区分请求（`input`，带 default）与响应（`output`）。
2. **操作一律用 `ref('<Name>')` 引用**。`ref` 的参数类型是 `keyof typeof schemas`，写错名字是编译错误；`$ref` 指向的 component 一定存在。
3. **命名约定**：请求体 `<Action>Request`（`AppUpdateRequest`、`CreateChannelRequest`、`InitUploadRequest`）；响应用「调用方拿到的名词」（`AppDetail`、`ChannelList`、`ChannelCreated`、`ChannelTrend`、`VersionTrend`、`EditorNotes`、`PublicNotes`、`SavedNote`、`ReleaseMetadata`、`UploadInitResponse`、`TauriFeed`、`OkResponse`）。
4. **错误响应统一引用 `Error`**，feed 的 JSON 引用 `TauriFeed`，不再重复内联。
5. **测试兜住三件事**：每个 JSON 请求体/响应体都是 `$ref`、每个 `$ref` 都能解析、每个 component 至少被引用一次。

## Alternatives

- **保持内联**：就是现状，模型名随路由变化，四种语言各自丑。拒绝。
- **在 SDK 仓库做后处理改名**：四套语言四套映射表，与契约漂移。拒绝。
- **手写一份独立 schema 文件**：与 Zod 双份事实来源。拒绝。

## Trade-offs & failure bounds

- 新增 operation 时编译器不会强制你起名，但「每个 JSON 请求/响应必须是 `$ref`」的测试会红。
- 嵌套对象仍然内联，Dart 会生成 `AppDetailChannelsInner` 这种名字。本轮只解决顶层模型名；嵌套命名留作后续。
- component 名进入 breaking-change 面：改名等同于一次 SDK major，必须走 review。
- 文档站 Scalar 直接渲染 `$ref`，体积也小了（重复的 `okResponseSchema` 只出现一次）。
