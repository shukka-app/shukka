# PRD: 版本标签发布容器镜像

## Problem

部署文档与 README 把 `ghcr.io/shukka-app/shukka` 当作公开运行镜像。`main` 上的 Docker workflow 已推 `latest`，但 git 版本标签不会在 GHCR 上留下可钉死的 `{version}` tag。

## Users

- **维护者**：打 git 标签即发布可钉死的镜像 tag，不必本机 `docker push`。
- **自托管运维**：`docker pull` / `docker run` 公开镜像；可钉死版本或跟 `latest`。

## Goals

1. 推送符合 semver 的 git 标签（`vMAJOR.MINOR.PATCH`，可带预发布后缀）后，GitHub Actions 用工作区根 context + `apps/shukka/Dockerfile` 构建并推送到 GitHub Container Registry。
2. 镜像名为 `ghcr.io/{owner}/{repo}`；规范仓库即 `ghcr.io/shukka-app/shukka`。
3. 正式版同时打 `{version}`、`{major}.{minor}`、非 0 的 `{major}`，以及 `latest`。预发布只打 `{version}`（可含后缀），不移动 `latest` / `{major}` / `{major}.{minor}`。
4. 公开仓库的镜像可匿名拉取，与现有 `docker run ghcr.io/shukka-app/shukka` 文档一致。
5. 构建失败则不推送；workflow 必须通过 actionlint。
6. 与 `main` 上已有的多架构（amd64+arm64）发布共用同一条 Docker workflow，避免第二条 job 覆盖 `latest`。`main` 继续发 `latest` 与 `sha-*`；PR 不发镜像。
7. PR 与 `main` 用单独的 Docker test workflow 构建同一份 `apps/shukka/Dockerfile`（工作区根 context，不推送），按文档化的 `docker run`、`apps/shukka/deploy/compose.yaml` 与 `apps/shukka/deploy/ansible/playbook.yml` 走通 health、setup、发版、feed；`docker run` 还覆盖卷重启与 electron-updater / rollback。见 `docs/adr/docker-image-ci.md`。

## Non-goals

- 创建 GitHub Release、changelog、npm 包。
- 推 Docker Hub 或其他 registry。
- 在 PR 上发镜像。
- 把对象存储或 MinIO 打进镜像。
- Helm chart 或其他编排打包。

## Flows

### 维护者：发一个正式版

1. 确认要发布的 commit 已在 `main` 且 CI 绿。
2. 打标签并推送，例如 `git tag v0.1.0 && git push origin v0.1.0`。
3. `Docker` workflow 构建、推送；GHCR 上出现 `0.1.0`、`0.1`、`latest`（major 为 0 时不打 `0`）。
4. 运维 `docker pull ghcr.io/shukka-app/shukka:0.1.0` 或未加 tag（即 `latest`）。

### 维护者：发预发布

1. 推送 `v1.2.3-rc.1` 这类预发布标签。
2. GHCR 出现 `1.2.3-rc.1`；`latest` 与稳定的 major/minor tag 不变。

### 失败

- 非 semver 的 `v*` 标签（如 `vfoo`）不触发；`v1.2`（缺 patch）不触发。
- `docker build` 失败：不 push。
- GHCR 鉴权/权限失败：构建可能已完成，但 registry 上没有新 tag。

## Acceptance criteria

- [ ] 推送 `vMAJOR.MINOR.PATCH` 后，`ghcr.io/shukka-app/shukka:{version}` 可匿名拉取。
- [ ] 同一正式版可拉取 `{major}.{minor}`；major ≥ 1 时可拉取 `{major}`；并可拉取 `latest`。
- [ ] 预发布标签不改变 `latest`。
- [ ] PR 不发布镜像。
- [x] `.github/workflows/docker.yml` 通过 actionlint。
- [x] Tag 规则与 `.github/workflows/docker.yml` 中 `docker/metadata-action` 的 `tags`（约 44–49 行）一致：`latest`（默认分支）、`sha-*`、semver `{version}` / `{major}.{minor}`、major ≥ 1 时的 `{major}`。
- [x] `.github/workflows/docker-test.yml` 在 Dockerfile / 应用源码变更的 PR 与 `main` 上构建镜像并走通容器主路径，不推送。
