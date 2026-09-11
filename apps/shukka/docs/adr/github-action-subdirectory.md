# ADR: GitHub Action 随应用放在 apps/shukka，uses 路径破坏性变更

## Status

Accepted.

## Context

JavaScript action 的契约仍是 [javascript-github-action](javascript-github-action.md)：`using: node24`，`main: scripts/shukka-upload.mjs`，不调 bash。产品迁到 `apps/shukka` 之后，`action.yml` 必须跟着走，否则根上会剩应用文件。GitHub 用 `uses: owner/repo/<path>@ref` 引用子目录 action。#86 已钉这是 major，且禁止根上留 stub。

## Decision

1. `action.yml` 只存在于 `apps/shukka/action.yml`。`runs.main` 仍是相对该文件的 `scripts/shukka-upload.mjs`。
2. 对外文档与 Integration snippet：`uses: shukka-app/shukka/apps/shukka@v2`（major 浮动）。精确 tag 同样带路径：`.../apps/shukka@v2.0.0`。
3. 本仓库 workflow：`uses: ./apps/shukka`。
4. **不**在仓库根放 `action.yml`（即便是转发 stub）。旧 `uses: shukka-app/shukka@v*` 在本 major 之后无效。
5. 发布 skill 的安装 snippet 指向嵌套 skill，不在根复制 `skills/`：
   `npx skills add https://github.com/shukka-app/shukka/tree/<ref>/apps/shukka/skills/shukka-publish`。

## Alternatives

- **根 stub `action.yml` 转发到 `apps/shukka`**：GitHub 的 JavaScript action 不能把 `main` 指到另一个 action 目录而不把脚本也留在根附近；composite stub 会把 bash 请回来。与「根上不留应用文件」和「不留 stub」都冲突。拒绝。
- **继续 `uses: shukka-app/shukka@v*`**：要求 `action.yml` 在根。拒绝。
- **把 uploader 单独打成 `actions/publish` 包**：多一个发布面，本切片不做。

## Trade-offs & failure bounds

- 已有 workflow 必须改 `uses:` 才能发版。这是故意的 major。
- `v1` 标签仍指向根 `action.yml` 的旧 commit；新 major 的 ref 才有子目录 action。
- 技能 CLI 按仓库内标准目录发现 skill；嵌套路径用 tree URL 直指 `apps/shukka/skills/shukka-publish`，避免依赖「找不到标准目录再递归」的兜底。
- actionlint 检查 `apps/shukka/action.yml` 与 `.github/workflows/`。
