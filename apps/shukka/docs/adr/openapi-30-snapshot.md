# ADR: 产品侧产出 OpenAPI 3.0.3 快照

## Status

Accepted.

## Context

规划中的多语言 SDK 要喂给四类生成器，它们对 3.1 的支持不一致：

| 生成器 | 3.1 |
|---|---|
| swift-openapi-generator | 能读 3.1，但会**静默丢弃** `type: "null"` 分支，nullable 字段直接消失 |
| `@hey-api/openapi-ts` | 原生支持 |
| openapi-generator（Dart / Rust） | 仍是 beta，校验器会直接拒绝不认识的 3.1 关键字（实测卡在 `propertyNames`） |
| progenitor（Rust 备选） | **只接受 3.0.x，其余报错** |

结论是四类生成器里只有 TypeScript 真正吃 3.1；Dart / Rust / Swift 都用 3.0.3 快照。

当前文档用到四种 3.1 独有写法：2 处 `type: ['string','null']`、8 处 `anyOf: [{...}, {type:'null'}]`、4 处 `const: true`、2 处 `propertyNames`（Dart 生成器直接把它当校验错误）。没有 `$defs`、`prefixItems`、数值型 `exclusiveMinimum`、schema 级 `examples`。

## Decision

1. **`openApiDocument()` 只产 3.1.0**，保持权威版本不变。
2. 新增纯函数 `toOpenApi30(doc)`（`src/server/openapi-30.ts`）：深拷贝后只访问 schema 位置（`components.schemas`、参数、`requestBody` / `response` 的 content），做四种降级：
   - `type: [X, 'null']` → `type: X, nullable: true`
   - `anyOf: [{...}, {type: 'null'}]` → 合并该分支并把 `nullable` 置 true
   - `const: v` → `enum: [v]`
   - `propertyNames` → 删除（3.0 无对应关键字；字符串键是隐含的）
3. **`sync:openapi` 多写一份 `public/openapi.v3.0.json`（en）**；实例端点 `GET /api/v1/openapi.json` 不变，仍是 3.1 英文。
4. 测试断言：3.0 输出不含上述三种写法，operation 集合与 3.1 相同，且不修改传入的 3.1 文档。

## Alternatives

- **让 SDK 仓库自己转换**：转换规则与 zod 生成器的输出耦合，上游加一个 zod 特性下游不会知道。拒绝。
- **只支持 3.1，换掉不兼容的生成器**：Dart / Rust 没有更好的选择。拒绝。
- **引入 openapi-down-convert 一类依赖**：只有三种写法，手写 80 行可读、可测、无依赖。拒绝。

## Trade-offs & failure bounds

- zod 升级后如果再冒出别的 3.1 关键字，3.0 快照会静默带出去。兜底是「无 3.1 写法」测试；它只能覆盖已知关键字，新关键字要补断言。
- 3.0 快照只有英文；SDK 的 docstring 跟英文。
- 文档站 Scalar 仍吃 3.1，3.0 只为代码生成存在，人类不必读。
- `default: null` 这类 3.0 里合法的字段原样保留，不参与降级。
