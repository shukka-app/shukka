# ADR: 发布时向 SDK 仓库发送 repository_dispatch

## Status

Accepted.

## Context

SDK 仓库（`shukka-app/sdk`）从 shukka 生成的 OpenAPI 快照生成四门语言的客户端。它的 `generate.yml` 已经监听 `repository_dispatch`（`shukka-release`）并读取 `client_payload.spec_base_url`，但 shukka 端从未发送过该事件——每次都要手动 `workflow_dispatch`，容易漏掉契约变更。

跨仓库 dispatch 不能用 `GITHUB_TOKEN`：它只对当前仓库有效。GitHub 也不支持一个仓库的 workflow 直接被另一个仓库的事件触发。

## Decision

1. **`.github/workflows/sdk-dispatch.yml` 在 `release: published` 时发送** `POST /repos/shukka-app/sdk/dispatches`，`event_type` 为 `shukka-release`。
2. **payload 钉到 tag**：`spec_base_url = https://raw.githubusercontent.com/shukka-app/shukka/<tag>/apps/docs/public`，并附带 `tag`。SDK 因此从这次 release 指向的提交生成，而不是从 dispatch 处理时可能已经前移的 `main`。
3. **认证用 fine-grained PAT**：仓库 secret `SDK_DISPATCH_TOKEN`，只授权 `shukka-app/sdk` 的 `Contents: read and write`。不建 GitHub App：那要额外的 app 注册与安装流程，收益与一个单仓 PAT 相同。
4. **secret 缺失时显式失败**：workflow 打印配置指引并退出 1，不静默跳过——漏发契约更新应当是可见的。
5. **保留 `workflow_dispatch`**：输入 `tag` 可在不重新发布的情况下补发一次。
6. **接收方保持现状**：`generate.yml` 无 diff 时不开 PR；重复 dispatch 是无害的。

## Alternatives

- **定时轮询 raw main**：没有额外 secret，但契约变更要等下一轮，且无法区分「release 了」与「main 动了」。拒绝。
- **`push: tags` 触发 dispatch**：tag 可能在 CI 通过前就推送；Release published 是一个明确的发布动作。拒绝。
- **把快照作为 release assets 再 dispatch**：SDK 的 TODO 里有这一项，最终形态更好（契约与发布产物同一处）。当前 `raw/<tag>/` 已经钉住同一份文件，先不阻塞。
- **在 SDK 仓库放一个 webhook 指向 shukka**：GitHub 的 repo webhook 不能跨仓库订阅 release 事件。拒绝。
- **GitHub App + installation token**：更适合多仓库、多消费者；目前只有一个 SDK 仓库，维护成本不划算。

## Trade-offs & failure bounds

- PAT 有到期时间；过期后 dispatch 失败，release 仍然正常发布。轮换时更新 `SDK_DISPATCH_TOKEN` 即可。
- PAT 泄露的影响面限于 SDK 仓库的 contents 写权限——这也是选择 fine-grained 而不是 classic `repo` scope 的原因。
- dispatch 只表示「契约可能变了」；SDK 是否生成 PR 由它自己的 diff 决定，shukka 不追踪 SDK 的版本。
- 手动 `workflow_dispatch` 的回填需要输入 tag，不会自动推断「最新 release」。
