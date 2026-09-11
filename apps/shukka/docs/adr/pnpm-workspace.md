# ADR: 仓库根改为 pnpm workspace，产品进 apps/shukka

## Status

Accepted.

## Context

应用占满 git 根，公开文档在另一个 git 仓库，所谓 monorepo 只是 submodule 伞仓。#86 要把元数据 persistence 做成 domain port，SQLite / Postgres 适配器进 `packages/*`。在抽出 port 之前必须先有工作区，且根上不能剩应用文件。

## Decision

1. **pnpm workspace** 在仓库根：`pnpm-workspace.yaml` 含 `apps/*` 与 `packages/*`，一把 lockfile。`packageManager` 钉 pnpm。本地用 `ni`；CI `pnpm install --frozen-lockfile`。
2. **当前产品**（TanStack Start 应用、Action、Docker、Compose/Ansible、内部 `docs/`、uploader 脚本、`skills/shukka-publish`）全部进入 `apps/shukka`。包名仍是 `shukka`，所以 `pnpm --filter shukka` 指向它。
3. **公开文档站**导入 `apps/docs`（包名 `shukka-docs`），保留 git 历史。不把文档站打进运行镜像。
4. **根**只留工作区清单、lockfile、`.github/`、`LICENSE`、`.gitignore`、产品 README，以及 agent / Docker / act 等平台文件。`packages/` 本切片为空，留给 #88。
5. **Docker**：build context 是工作区根，`file: apps/shukka/Dockerfile`。构建阶段用 pnpm 装 `shukka` 的依赖并 `pnpm build`；运行阶段仍是 Alpine + `.output` + `drizzle/`，`WORKDIR /app`。启动时 `./drizzle` 存在则 migrate，与今天相同。
6. **从源码启动**的 cwd 是 `apps/shukka`（不再是 git 根）。镜像内 cwd 仍是 `/app`。

## Alternatives

- **继续单包根 + 日后硬拆**：store 包没有落点，文档站继续跨仓库同步。拒绝。
- **npm / yarn workspaces**：#86 已钉 pnpm。
- **把文档站留在 shukka-app/docs**：OpenAPI 同步与 submodule 伞仓继续分叉。拒绝；归档是本 issue 之后的事。
- **Docker context 仍是 `apps/shukka`**：workspace lockfile 与 `pnpm-workspace.yaml` 在上一级，装依赖会缺文件。拒绝。
- **运行镜像 `WORKDIR` 改成 `/app/apps/shukka`**：无必要，且会改 migrate 对 `./drizzle` 的假设。拒绝。

## Trade-offs & failure bounds

- 运维拉 GHCR 镜像的路径不变；从源码 `docker build` 必须在仓库根加 `-f apps/shukka/Dockerfile`。
- `packages/*` 空着时 Docker 仍要能 `pnpm install --frozen-lockfile --filter shukka...`。文档站的 `package.json` 可以拷进构建阶段以满足 lockfile，但源码不得进入运行镜像。
- 根 README 是产品前门：命令改成 workspace filter，文档链接改到 `apps/shukka/...`。
- 本 ADR 不决定 Action 的 `uses:` 字符串；见 [github-action-subdirectory](github-action-subdirectory.md)。
