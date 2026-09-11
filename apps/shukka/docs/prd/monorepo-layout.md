# PRD: pnpm 工作区布局（apps/shukka + apps/docs）

## Problem

应用就是仓库根：源码、Action、Docker、内部 PRD/ADR 全堆在 git root。人类文档在独立仓库 [shukka-app/docs](https://github.com/shukka-app/docs)，用 `SHUKKA_REPO=../shukka` 同步 OpenAPI。[shukka-app/monorepo](https://github.com/shukka-app/monorepo) 是 submodule 伞仓，不是工作区。后续 store 包（#88 / #89）没有干净的落点。

## Users

- **维护者**：在一个 git 根上开发产品、文档站、以及日后的 store 包。
- **自托管运维**：仍用 `ghcr.io/shukka-app/shukka` 和 Compose / Ansible 示例；不需要知道工作区。
- **CI 发布者**：GitHub Action 的 `uses:` 路径随布局改变。
- **Agent / 文档读者**：内部文档与公开文档站都从本仓库出。

## Goals

1. git 根是 pnpm workspace（`apps/*`、`packages/*`），一把 lockfile。本地用 `ni`；CI 用 `pnpm` 对 lockfile。
2. 当前产品全部进入 `apps/shukka`。根上不留应用源码：`src/`、`tests/`、`public/`、`scripts/`、`skills/`、`drizzle/`、`deploy/`、`Dockerfile`、`action.yml`、`wrangler.jsonc`、Vite/vitest/tsconfig、`components.json`、`cloudbaserc.json.example`、内部 `docs/prd|adr|spec`。
3. 把 [shukka-app/docs](https://github.com/shukka-app/docs) 导入 `apps/docs`（保留 git 历史）。`sync:openapi` 的默认 `SHUKKA_REPO=../shukka` 变成 `apps/docs` → `apps/shukka`。
4. 根只留工作区与平台文件：`package.json` / `pnpm-workspace.yaml` / lockfile、`.github/`、`LICENSE`、`.gitignore`、产品 README（前门，命令按工作区更新）。
5. CI、Docker、Compose、Ansible、worker-size、action-test、`.github/scripts/start-server.mjs` 指向新路径。Docker **context 是工作区根**，`file: apps/shukka/Dockerfile`。运行镜像不含 `apps/docs`。
6. GitHub Action 随应用移动。对外 `uses: shukka-app/shukka/apps/shukka@v*`（major）。仓库内测试 `uses: ./apps/shukka`。不在根留 `action.yml` stub。
7. `npx skills add` / `shukka-publish` 在移动后仍能解析。技能 CLI 看不到嵌套 skill 时改 snippet，不在根复制一份 `skills/`。
8. 产品 HTTP 行为不变。本切片不抽 store port、不改 migrate、不加 Postgres。

## Non-goals

- 抽出 store port、改 `boot()` / migrate、加 Postgres（#88 / #89）。
- 归档 `shukka-app/docs` 或 `shukka-app/monorepo`（本 issue 之后）。
- 根上留 `action.yml` 兼容 stub。
- 把 SQLite 默认改成别的、把 MinIO 打进运行镜像。

## Flows

### 维护者：开发产品

1. 在仓库根 `ni`。
2. `nr --filter shukka dev`（或 `pnpm --filter shukka dev`）在 :3000 跑面板 + API。
3. `nr --filter shukka check` 跑 lint / typecheck / test。
4. 内部文档在 `apps/shukka/docs/`。

### 维护者：开发文档站

1. `nr --filter shukka-docs dev`。
2. API 契约变更后 `nr --filter shukka-docs sync:openapi`，默认从 `../shukka` 读 `src/server/openapi.ts`，写出 `apps/docs/public` 下的快照。

### 运维：Docker / Compose / Ansible

与今天相同：`docker run ghcr.io/shukka-app/shukka`，或仓库内 Compose / Ansible。从源码构建时 context 是工作区根、Dockerfile 在 `apps/shukka/Dockerfile`。容器内 cwd 仍是 `/app`，`./drizzle` 仍在启动时 migrate。

### CI 发布者：GitHub Action

把

```yaml
- uses: shukka-app/shukka@v1
```

换成

```yaml
- uses: shukka-app/shukka/apps/shukka@v2
```

这是 major。旧路径在本仓库不再提供 `action.yml`。

## Failure behavior

- 根上残留应用文件：验收失败（`git ls-files` 根目录不是工作区 + 平台文件）。
- Docker 把 `apps/docs` 打进运行镜像：镜像体积与无关源码泄漏。
- 根上留 `action.yml` stub：与「不留 stub」冲突，且掩盖 `uses:` 破坏。
- migrate 因 cwd 找不到 `drizzle/`：源码启动必须在 `apps/shukka`；镜像 `WORKDIR /app` 且拷贝 `drizzle/`，行为与今天相同。

## Acceptance criteria

- [x] `git ls-files` 在仓库根只有工作区 + 平台文件。
- [x] `pnpm --filter shukka` 的 dev / build / test / worker-size 可用。
- [x] Docker（根 context + `apps/shukka/Dockerfile`）构建成功，health / 首次 session / `./drizzle` migrate 与 `/data` 卷行为不变。setup → publish → feed 仍由 `docker-test.yml` 覆盖。
- [x] 仓库内 workflow 使用 `uses: ./apps/shukka`。major 说明 `uses: shukka-app/shukka/apps/shukka@v2`。
- [x] `apps/docs` 的 `build` 可用；`sync:openapi` 从 `apps/shukka` 写快照。
- [x] Compose / Ansible 路径已更新到 `apps/shukka/deploy/`。
- [x] 产品 HTTP 面未改（本切片只搬家）。

## Resolved product decisions

- 工作区用 pnpm；本地 `ni`，CI `pnpm` 对 lockfile。
- 产品进 `apps/shukka`，公开文档站进 `apps/docs`，store 包日后进 `packages/*`。
- Action 路径 `uses: shukka-app/shukka/apps/shukka@v*` 是破坏性 major；不留根 stub。
- Docker context 是工作区根；运行镜像只有应用构建产物与 `drizzle/`，不含文档站。
- 本切片不改 HTTP、migrate、存储后端。
