# ADR: CI 用 Actions matrix 覆盖 s3proxy 与 JuiceFS S3

## Status

Accepted（2026-10-31 修订：Docker 后端由 MinIO 换成 s3proxy）。

## Context

面板把 MinIO 与 JuiceFS 都当作一等 S3 兼容后端（向导预设 path-style、JuiceFS 用 `juicefs gateway`）。上传、探测、feed 302 都依赖对方的 presigned URL 行为。原先 CI 只拉起 MinIO：JuiceFS 网关的差异（region 被忽略、bucket 由 `--bucket-name` 预置、健康检查仍走 `/minio/health/live`）不会在 PR 上被跑到。

2026-10-31 起，MinIO 的容器镜像无法匿名拉取：`quay.io/minio/minio` 返回 `unauthorized`（quay 的 API 也要求认证），Docker Hub 上的 `minio/minio` 同样已不存在。`quay.io/minio/minio:latest` 出现在 `start-s3.mjs`、`deploy/compose.yaml`、Ansible playbook 与 Docker test 的三个 job 里，导致这些路径全部在启动阶段失败。MinIO 的 **GitHub release 二进制**仍然公开，非 Docker job（Windows / macOS）本来就下载它。

## Decision

1. **GitHub Actions `strategy.matrix.s3: [s3proxy, juicefs]`**，`fail-fast: false`，每个后端一台 runner。
2. **Docker 路径统一用 s3proxy**（`andrewgaul/s3proxy`，文件系统后端）：`start-s3.mjs`、`deploy/compose.yaml`、Ansible playbook、Docker test 的 image / compose / ansible job。理由：它校验 SigV4、支持 presigned PUT/GET、HeadObject、GetObject、DeleteObject 与 DeleteObjects，且是 SDK 契约栈已经验证过的组合。
3. **按 digest 钉住镜像**（`andrewgaul/s3proxy@sha256:1f89…`）。s3proxy 不发布 semver 标签，`master` 漂移会悄悄改变 CI。
4. **bucket 就是 `/data` 下的目录**：文件系统后端把 bucket 名映射为子目录，所以 `docker exec s3proxy mkdir -p /data/releases` 等价于原先的建 bucket；健康检查用 `GET /`（任何 HTTP 响应即视为就绪）。
5. **非 Docker job 继续用 MinIO 二进制**：`start-minio.mjs` 从 GitHub release 下载固定版本，Windows / macOS action e2e 不改。MinIO 作为产品支持的 endpoint 仍有真实客户端覆盖。
6. **`.github/workflows/ci.yml` 的 `s3` job** 每条 PR / `main` 都跑：写探测（创建 app）、presigned PUT、finalize HeadObject、feed 302 下载。这是兼容性的最低保证。
7. **`action-test.yml` 的 Ubuntu `publish` / `tauri-updater` 同样 matrix**，在相关路径变更时用真实 electron-updater / plugin-updater 再走一遍。JuiceFS CI 网关沿用 `scripts/juicefs-dev.mjs` 的 `juicedata/mount` 镜像。

## Alternatives

- **Linux 也改用 MinIO 二进制**：保留原语义，但把一次 GitHub release 下载加到每条 Linux PR；s3proxy 已覆盖同一组 S3 API，MinIO 仍由 Windows / macOS job 覆盖。
- **只在 Linux 加二进制、Docker 示例仍用 MinIO**：示例栈按原文件无法启动，等于保留一个坏掉的用户可见交付物。
- **固定到可匿名拉取的旧 MinIO 镜像**：不存在这样的旧镜像；匿名访问整体被关闭。
- **用镜像镜像站 / 第三方 MinIO 镜像**：供应链与维护责任都不在 MinIO 官方，CI 不该依赖。
- **换成 SeaweedFS / VersityGW / rclone serve s3**：没有在 Shukka 的 presigned 流程上验证过；s3proxy 是已验证的选择，先减少未知数。
- **只测 s3proxy**：实现简单，但 JuiceFS 是向导里的一等选项，回归缺口正好落在用户会配的那条路径上。
- **两个独立 workflow**：触发条件与脚本会分叉；matrix 让「测哪些后端」成为一处清单。

## Trade-offs & failure bounds

- s3proxy 不是生产对象存储：它证明 S3 语义，不证明 MinIO / R2 的运维特性。MinIO 的客户端行为由 Windows / macOS e2e 兜底。
- 文件系统后端要求 bucket 目录先存在；`start-s3.mjs`、playbook 与 CI 都显式 `mkdir`，漏掉时第一条 PUT 会失败。
- digest 需要人工更新；更新时改 `start-s3.mjs` 与 `compose.yaml` 两处（CI 使用的镜像由前者拉起，示例栈由后者拉起）。
- JuiceFS job 首次要拉 `juicedata/mount:ce-v1.4.1`；镜像或 `juicefs gateway` 标志变更会红——这是要的。
- 两个后端共用默认凭证与 `releases` bucket 名，和本地开发约定一致。
- Windows 路径不证明 JuiceFS / s3proxy；Linux matrix 才是它们的契约测试。
- `verify-feed.mjs` 每步 30s 超时并打印正在请求的 URL，避免某一步挂死占满 runner 且没有日志。
