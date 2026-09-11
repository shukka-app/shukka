# ADR: GitHub Action 用 composite + 仓库内 Node 脚本

> Superseded by [javascript-github-action.md](javascript-github-action.md). Windows 自建 runner 只有 MinGit 时 `shell: bash` 无法启动。保留本文作历史记录。

## Context

需要一个官方 action 让用户在 CI 里把 electron-builder 产物发到 Shukka，可通过 `uses: akarachen/shukka@main` 引用；要求能用 act 本地测试、actionlint 静态检查。

## Decision

- 仓库根放 `action.yml`（composite action）：inputs 为 `server-url`、`api-key`、`app`、`channel`、`version`、`directory`（electron-builder 输出目录）、`release`（默认 false）。
- 核心逻辑是仓库内零依赖 Node 脚本 `scripts/shukka-upload.mjs`（只用 Node 内置 fetch/fs），composite step 用 `node $GITHUB_ACTION_PATH/scripts/shukka-upload.mjs` 调用；同一脚本可脱离 action 在任意 CI 使用。
- CI workflow 跑 actionlint；本地用 act + 示例 workflow 验证 action 端到端。

## Alternatives

- **JavaScript action（ncc 打包 dist）**：正统但要维护提交 dist 产物，diff 噪音大。
- **Docker action**：mac/windows runner 不可用，而 electron 多平台构建恰恰在这些 runner 上跑。

## Trade-offs & failure bounds

- composite 无 `@actions/core`，输出/错误用退出码与 GitHub workflow commands 字符串（`::error::`）表达。
- 脚本零依赖意味着不引入重试库：直传失败重试逻辑自实现（每文件有限次指数退避）。
