# ADR: GitHub Action 入口留在仓库根，脚本在 apps/shukka

## Status

Accepted.

## Context

产品迁到 `apps/shukka` 之后，#87 原稿要把 `action.yml` 跟着走，并把 `uses:` 改成 `shukka-app/shukka/apps/shukka@v*`（major），禁止根 stub。`uses: owner/repo@ref` 只认仓库根的 `action.yml`。把入口挪进子目录会让已有 workflow 全部改一行，而 uploader 本身没有变。根上放一份真正的 JavaScript action metadata（`main` 指到应用内脚本）不是 stub，也不把 bash 请回来。

## Decision

1. 仓库根保留 `action.yml`，作为 GitHub 的 action 入口（平台文件，和 `.github/` 同类）。`runs.using: node24`，`main: apps/shukka/scripts/shukka-upload.mjs`。
2. 对外仍是 `uses: shukka-app/shukka@v*`。本仓库测试 `uses: ./`。
3. 不在 `apps/shukka/action.yml` 再放一份，避免两个入口。
4. 不写 composite / 转发 stub。
5. 发布 skill 仍在 `apps/shukka/skills/shukka-publish`；安装 snippet 用 tree URL 直指该目录，不在根复制 `skills/`。

## Alternatives

- **`action.yml` 跟着应用到 `apps/shukka`**：`uses:` 变成子目录路径，已有 CI 全破。拒绝。
- **根 composite stub 再调子目录 action**：多一层、可能把 bash 请回来。拒绝。
- **根 `action.yml` + 根上再留一份 `scripts/shukka-upload.mjs`**：应用文件漏在根上。拒绝。

## Trade-offs & failure bounds

- 根 `git ls-files` 会看到 `action.yml`。这是 GitHub 解析 `uses: owner/repo@ref` 的入口，不是应用源码。
- `main` 是相对 `action.yml` 的路径，必须跟着脚本走；搬 uploader 时要一起改这一行。
- actionlint 检查根 `action.yml` 与 `.github/workflows/`。
