# ADR: OpenAPI 叙事文案用类型化字典，按 locale 生成两份文档

## Status

Accepted.

## Context

`openApiDocument(origin)` 把路径、Zod JSON Schema 与英文叙事写在同一份对象里。文档站 Scalar 只吃一份 `public/openapi.json`。要把人类可读说明做成中英两份，同时保持路径与 schema 为单一事实来源。

## Decision

1. **叙事字典**与面板 i18n 同构：`src/server/openapi-copy.ts` 里 `en` 为源语言与类型来源，`zh` 用 `satisfies typeof en` 编译期键对齐。只覆盖 OpenAPI 叙事字段（info、tags、summaries、descriptions、response descriptions）。
2. **`openApiDocument(origin, locale = 'en')`**：locale 为 `'en' | 'zh'`（与面板 locale 码一致）。路径、方法、参数名、`z.toJSONSchema` 输出、security scheme 名不进字典。
3. **实例端点不变**：`GET /api/v1/openapi.json` 仍调用默认英文文档。中文只服务文档站静态快照，不给活实例加语言协商。
4. **文档站快照**：`sync:openapi` 写出 `public/openapi.json`（en）与 `public/openapi.zh-CN.json`（zh）。Scalar `url` 按页面 `[lang]` 选择；文件名跟文档站 locale，不跟生成器短码。i18n middleware matcher 必须排除 `openapi*.json`，否则 `/openapi.zh-CN.json` 会被加上语言前缀。

## Alternatives

- **实例 `?locale=` / `Accept-Language`**：脚本与 agent 已依赖英文契约；加协商会让机器面分叉。拒绝。
- **把叙事写进 Zod `.meta({ description })` 并按 locale 重建 schema**：污染机器契约，且 schema 要按语言实例化。拒绝。
- **文档站自己翻译 / 维护一份中文 OpenAPI**：与主仓库生成器漂移。拒绝。
- **i18n 框架**：两种语言、纯字符串，过重。

## Trade-offs & failure bounds

- 新增或改写 operation 叙事必须同时改 en/zh；漏 zh 键是编译错误，漏改已有英文字符串则中文会过时——靠 code review 与「两份 path 集合相同」的测试，不做自动翻译。
- 活实例永远英文；要中文说明请看文档站。旧书签 `/openapi.json` 仍是英文。
- Tag **name** 随 locale 翻译（Scalar 侧栏分组标题）。path/method 不变，不影响代码生成或契约比对。
