# ADR: semver 标签与 main 共用 Docker workflow 推 GHCR

## Status

Accepted

## Context

部署文档把 `ghcr.io/shukka-app/shukka` 当作公开运行镜像。仓库已有 `.github/workflows/docker.yml`：在 `main` 上用 QEMU 构建 `linux/amd64,linux/arm64`，推 `latest` 与 `sha-*`。缺的是 semver git 标签对应的镜像 tag（`0.1.0` / `0.1`）。另开一条只发 amd64 的 tag workflow 会把多架构 `latest` 覆盖成单架构。

## Decision

- 版本发布并入现有 `.github/workflows/docker.yml`：`push` 的 `v*.*.*` 标签（GitHub glob，覆盖正式版与 `v1.2.3-rc.1` 这类预发布）也跑同一 job。
- 镜像 `ghcr.io/${{ github.repository }}`，`GITHUB_TOKEN` 登录 GHCR（`packages: write`）。规范仓库为 `ghcr.io/shukka-app/shukka`。
- `docker/metadata-action`：`main` 继续打 `latest` 与 `sha-*`；semver 标签再打 `{{version}}`、`{{major}}.{{minor}}`、major 非 0 时的 `{{major}}`。`flavor: latest=auto` 让正式版 tag 也更新 `latest`。
- 平台保持 `linux/amd64,linux/arm64`（已在 main 上跑通）。不在本 workflow 重跑单元测试；`apps/shukka/Dockerfile` 已 `pnpm build`，构建失败即不 push。
- `org.opencontainers.image.source` 由 metadata-action 写入，包关联本仓库；公开仓库可匿名拉取。

## Alternatives

- **只发 `latest`**：运维无法钉死 `{version}`，回滚只能赌 registry 里还留着旧 digest。
- **独立 `publish-image.yml` 只在 tag 上跑、只发 amd64**：和现有 Docker workflow 抢 `latest`，正式版镜像变成单架构。
- **`release: published` 触发**：比 `git push --tags` 多一道 GitHub Release UI。
- **本机脚本 / `docker buildx bake`**：没有标签即发布的门闩，也没有 `GITHUB_TOKEN` 路径。

## Trade-offs & failure bounds

- 打 tag 会再跑一遍多架构构建（约数分钟）；与 `main` 上已有的 `latest` 可能短时间并存两次 push。
- 首次在 org 下建包可能受 Actions / Packages 权限限制；需仓库「Read and write」workflow 权限。
- 重发同一 git tag：Git 默认拒推；覆盖 GHCR tag 需删 tag 再推，或对失败 run 点 Re-run。
- 预发布只扩展 `{{version}}`，不移动 `latest` / `{major}` / `{major}.{minor}`。
- major `0` 不生成 `:0`。
