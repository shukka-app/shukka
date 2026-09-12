# PRD: Promote 后 webhook——feed 指针切换时通知外部系统

Spike / 设计稿。未完成 `$feature-dev` 质问。下列开放问题保持未决，不在本文发明产品答案。实现前必须先质问，再改 `docs/spec.md` 与代码。

## Problem

Draft → promote 是现行发版模型（`docs/prd/draft-releases.md`）。`PATCH /api/v1/apps/{slug}/channels/{channel}` 带 `{ currentVersion }` 会写入 `releasedAt`（若目标是 draft）并切换 channel 的 feed 指针。回滚是同一次 PATCH，只切指针。

这次切换对 CI、Slack、运维频道是静默的。仓库里没有 webhook / notify 代码。内容编辑能看发布状态但不能 promote（`docs/prd/view-roles.md`）。调用方只能自己轮询 feed 或面板，才能知道「现在线上是哪一版」。

## Users

- **管理员 / 开发者**：在面板或 API 上 promote / 回滚，希望外部系统在 feed 真正切换时收到通知。
- **内容编辑**：不 promote，但关注「哪一版已上线」；webhook 不是给他们点的入口，他们仍靠面板。
- **CI（上传 draft 的一方）**：制品已在库里，需要知道人事后 promote（或 `release: true` 一步上线）何时把 feed 指过去。

## Goals

1. 每个 app **可选**配置一个 HTTPS webhook URL；未配置则不投递。
2. 仅在 `currentVersion` **实际发生变化**时触发（promote 或回滚）。PATCH 目标已是 current、或其它不改指针的写操作，不发。
3. 请求体字段为 `{ app, channel, version, releasedAt, previousVersion }`。
4. 请求带 HMAC 头，接收方可以验签。
5. 投递失败写入日志，不假装成功。
6. 投递在切换事务提交**之后异步**进行，不增加 feed 路径延迟；webhook 失败不回滚已经切过去的 `currentVersion`。

## Non-goals

- 每次 finalize / 仅创建 draft 时通知。
- 恰好一次（exactly-once）投递保证。
- 入站 webhook（Shukka 不接收外部系统回调来 promote）。
- 用 webhook 替代面板：内容编辑与管理员仍在面板看状态、写 notes、点 promote。
- Slack 专用适配器或其它供应商 SDK。
- 本次不改 `docs/spec.md`、不落 schema、不写 `fetch()`。

## Flows

### 管理员：promote 一个 draft

1. 面板或 `PATCH .../channels/{channel}` `{ currentVersion }` 指向某 draft。
2. 事务写入 `releasedAt` 并切指针；公开 feed 立即指向新版本。
3. 若该 app 配置了 webhook URL，事务提交后异步 POST 上述 payload（`previousVersion` 为切换前的 current，可能为空）。

### 管理员：回滚

1. 同 PATCH，目标为另一已发布版本。
2. 指针切换成功后同样异步通知；`version` 是新的 current，`releasedAt` 是该版本原有发布时间。

### 未配置 / 未真正切换

1. app 无 webhook URL：promote / 回滚行为与今日相同，无出站请求。
2. PATCH 未改变 `currentVersion`：不投递。

## Open questions

仓库里推不出产品答案，质问前保持未决：

1. **URL 作用域**：一个 URL per app，还是 per channel？Goals 按 per-app 起草，channel 级覆盖是否需要未定。
2. **重试策略**：失败后不重试、有限次重试，还是进死信？本文不选。
3. **密钥存放**：HMAC secret 是否复用 S3 凭证那把 AES-256-GCM 数据目录密钥（`docs/adr/per-app-s3-and-secrets.md`），还是单独一把？
4. **SSRF**：用户提供的 URL 是出站 POST。https-only 是否足够？要不要拒绝 link-local / 元数据地址 / 私网？S3 endpoint 同属用户可控 URL，仓库里目前没有 webhook 级 allowlist 可沿用。

## Acceptance criteria

- [ ] app 可配置可选的 HTTPS webhook URL；未设置时 promote / 回滚不发起出站请求。
- [ ] `currentVersion` 从 A 变为 B（含 A 为空的首次 promote，以及回滚）时发出一次 webhook；目标已是 current 的 PATCH 不发。
- [ ] `POST /api/v1/upload/finalize` 在未带 `release: true`（只建 draft、不改 current）时不发 webhook。
- [ ] 请求体包含 `app`、`channel`、`version`、`releasedAt`、`previousVersion`。
- [ ] 请求带 HMAC 头；用错误密钥验签失败。
- [ ] 对端非 2xx、超时或网络错误时，实例日志能查到失败；`currentVersion` 与 feed 仍保持已提交的切换。
- [ ] webhook 投递不在切指针的事务内同步等待：feed / 制品 302 的可用性不依赖对端响应时间。
