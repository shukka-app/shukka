# ADR: GitHub Action 用 runner Node 直接跑仓库内上传脚本

## Context

需要一个官方 action 让用户在 CI 里把构建产物发到 Shukka。原先用 composite + `shell: bash` 调 `scripts/shukka-upload.mjs`。Windows 自建 runner 常常只有 MinGit：没有 `bash.exe`，composite step 在 Node 脚本启动前就失败。GitHub-hosted Windows 自带 Git for Windows，掩盖了这个问题。

`node20` JavaScript action runtime 已于 2026-03-04 弃用。

## Decision

- `action.yml` 为 JavaScript action：`runs.using: node24`。布局迁入工作区后入口仍在仓库根，`main: apps/shukka/scripts/shukka-upload.mjs`，见 [github-action-subdirectory](github-action-subdirectory.md)。
- runner 自带的 Node 直接执行上传脚本，不经过 bash / pwsh / cmd。MinGit-only 自建 Windows runner 只要 Actions runner 本身（含 node24）即可。
- 脚本继续零依赖（只用 Node 内置 fetch/fs）。作为 action 时读 `INPUT_*`（`server-url` → `INPUT_SERVER-URL`）；脱离 action 时仍读 `SHUKKA_*`。输出仍写 `GITHUB_OUTPUT`。
- 不引入 `@actions/core`、不提交 ncc `dist`。
- `action-test.yml` 的 `publish-windows` 在 `windows-latest` 上走完整路径：MinIO 官方二进制（hosted Windows 无 Docker）→ 构建并启动 Shukka → `uses: ./` → 校验 feed → 宿主平台 electron-updater check/download。

## Alternatives

- **继续 composite + `shell: bash`**：Linux/mac 与 hosted Windows 可用；MinGit 自建 Windows 不可用。这是当前故障。
- **composite + `pwsh` / `cmd`**：自建 Windows 不保证有 pwsh；cmd 在 Ubuntu/macOS runner 上不可用。
- **composite + `shell: node {0}`**：仍要求 PATH 上有 `node`，用的不是 runner 自带 runtime。
- **ncc 打包 JavaScript action**：正统但要维护提交 dist，当初拒绝 composite 的理由仍然成立。脚本已零依赖，没有打包必要。
- **Docker action**：mac/windows runner 不可用。

## Trade-offs & failure bounds

- JavaScript action 不能像 composite 那样写多 step；本 action 本来就只有一步。
- 自建 runner 必须是带 node24 runtime 的 Actions runner（2025 年中之后的 runner 已包含）。更旧的 runner 需要升级，不能靠 `actions/setup-node` 补上 action runtime。
- 输出/错误仍用退出码与 `::error::` / `GITHUB_OUTPUT`，不用 `@actions/core`。
- 直传失败重试仍是脚本内有限次指数退避。
