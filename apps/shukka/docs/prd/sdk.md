# PRD: 多语言 SDK 的契约前置条件

**Status: 契约侧已落地；SDK 仓库与生成流水线是后续工作。**

## Problem

公开 API 有 OpenAPI 3.1 文档，但 21 个 operation 全都没有 `operationId`，也没有 3.0 版本。Dart / Rust 的生成器对 3.1 只到 beta，Rust 的 progenitor 直接拒绝 3.1；Swift 生成器用 `operationId` 命名函数，缺了就只能退化成不可读的名字。规划中的 `shukka-sdk`（新仓库，按 spec 生成 Dart / JS / Swift / Rust 客户端）因此无法开工。

## Users

- 在 CI 或服务端脚本里调用 App API 的开发者。
- 自研客户端读取公开 feed / notes 的场景（非 Electron / Tauri / Sparkle 的官方 updater 路径）。
- 维护者：改 API 时要能被测试告知「这次改动会不会打断已生成的 SDK」。

## Goals

1. 每个公开 operation 都有唯一、稳定的 `operationId`（lowerCamelCase）。
2. 每个请求体与响应体都是具名的 `components.schemas` 条目，生成的模型名由契约决定，而不是由路由和状态码拼出来。
3. 同一份契约同时产出 OpenAPI 3.1.0 与 3.0.3 两种 JSON。
4. 契约漂移由测试兜住：缺 id、重复 id、改名、内联 schema、3.1 写法漏进 3.0 都要红。

## Non-goals

- 在本仓库生成或分发 SDK（那是新仓库的事）。
- 为上传协议做 SDK 封装：`init → presigned PUT → finalize` 是 SDK 层的真正价值点，但优先级低于只读路径，本轮不设计。
- 让活实例端点返回 3.0 或按语言协商。
- 把 session-only 的管理操作写进公开契约。

## Flows

### 维护者：新增一个 operation

1. 在 `openapi-copy.ts` 的 `ops` 里加 key（en 与 zh 同时加，编译器强制两边都有）。
2. 在 `openapi.ts` 的 path 里写 `...operation(t, '<key>')`。
3. 更新 `tests/openapi.test.ts` 的 golden 映射。

漏掉任何一步都编译不过或测试红。

### SDK 侧：消费契约

1. 取 `openapi.json`（3.1.0）或 `openapi.v3.0.json`（3.0.3），两者 operation 集合相同。
2. 生成器按 `operationId` 命名方法；path 改名不影响方法名。

## Acceptance criteria

- [x] 21 个 operation 全部有 `operationId`，全局唯一，匹配 `^[a-z][A-Za-z0-9]*$`。
- [x] 中英文档的 operationId 完全一致。
- [x] golden 映射锁住 `METHOD path → operationId`，改名必须显式改测试。
- [x] 每个 JSON 请求体/响应体都是 `$ref`，每个 `$ref` 可解析，每个 component 至少被引用一次。
- [x] `toOpenApi30` 输出 3.0.3，且不含 `type` 数组、`const`、`anyOf + null`。
- [x] 3.0 转换不修改入参的 3.1 文档。
