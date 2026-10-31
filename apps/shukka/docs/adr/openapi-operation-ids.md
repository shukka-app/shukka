# ADR: operationId 取自 OpenAPI 叙事字典的 key

## Status

Accepted.

## Context

生成 SDK 要求每个 operation 有唯一、稳定的 `operationId`：Swift 生成器用它命名方法，progenitor 缺了直接报错，其余生成器只能靠 method+path 拼出不可读的名字。仓库里已经存在一份 21 个操作的手写名表——`src/server/openapi-copy.ts` 的 `ops`：`en` 定义类型，`zh` 用 `satisfies` 做键对齐，每个 operation 的叙事本来就从这里取。

## Decision

1. **`ops` 的 key 就是 operationId**。`openapi.ts` 的 `operation(copy, id)` helper 把两者绑死：

   ```ts
   function operation(copy: OpenApiCopy, id: keyof OpenApiCopy['ops']) {
     return { operationId: id, ...opNarrative(copy.ops[id]) }
   }
   ```

   每个 path 从 `...opNarrative(t.ops.getApp)` 改为 `...operation(t, 'getApp')`。

2. **类型层面强制**：新增 path 不给 id 编译不过；给了 `ops` 里不存在的名字编译不过；补 key 时漏了 zh 编译不过（`satisfies OpenApiCopy` 已在管）。

3. **类型管不了的三件事交给测试**（`tests/openapi.test.ts`）：id 全局唯一、匹配 `^[a-z][A-Za-z0-9]*$`、中英一致，以及一张手写的 `METHOD path → operationId` golden 映射。

4. **本次顺带改名**：10 个偏「文档标题」的 key 改成动词式，因为它们同时会成为 SDK 方法名——`patchApp` → `updateApp`、`setCurrent` → `setCurrentVersion`、`channelTrend` → `getChannelTrend`、`versionTrend` → `getVersionTrend`、`editorNotes` → `getEditorNotes`、`publicNotes` → `listPublicNotes`、`uploadInit` → `initUpload`、`uploadFinalize` → `finalizeUpload`、`channelFeed` → `getChannelFeed`、`publicFeed` → `getFeedFile`。

## Alternatives

- **从 method+path 自动推导**：path 一改名 id 就变，已生成的 SDK 全部断掉，还会产出 `getApiV1AppsByAppSlugChannelsByChannel` 这种名字。拒绝。
- **另建一张 operationId 表**：同一份名字两处维护，必然漂移。拒绝。
- **只加测试、不加类型约束**：漏写 id 要等跑测试才发现。拒绝。

## Trade-offs & failure bounds

- 改 id 或改 path 都会让 golden 测试红。这是有意的：它提示 SDK 需要一次 major。
- 仓库里没有后端代码生成框架，id 只存在于文档生成路径，不影响路由实现（`docs/adr/app-api-v1.md` 的约束仍然成立）。
- `ops` 的 key 现在同时承担三件事：类型来源、叙事查找、公开契约名，所以改 key 的成本比过去高——这是本条决策的主要代价。
- golden 表是手写的 21 行；新增 operation 必须同时动 en、zh、golden 三处。
