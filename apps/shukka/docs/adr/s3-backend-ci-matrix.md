# ADR: CI 用 Actions matrix 覆盖 fakes3 与 JuiceFS S3

## Status

Accepted（2026-10-31 修订：Docker 后端由 MinIO 换成 s3proxy；2026-11-02 修订：CI 的通用 S3 后端由 s3proxy 换成 fakes3，示例栈仍用 s3proxy）。

## Context

面板把 MinIO 与 JuiceFS 都当作一等 S3 兼容后端（向导预设 path-style、JuiceFS 用 `juicefs gateway`）。上传、探测、feed 302 都依赖对方的 presigned URL 行为。原先 CI 只拉起 MinIO：JuiceFS 网关的差异（region 被忽略、bucket 由 `--bucket-name` 预置、健康检查仍走 `/minio/health/live`）不会在 PR 上被跑到。

2026-10-31 起，MinIO 的容器镜像无法匿名拉取：`quay.io/minio/minio` 返回 `unauthorized`（quay 的 API 也要求认证），Docker Hub 上的 `minio/minio` 同样已不存在。MinIO 的 **GitHub release 二进制**仍然公开，非 Docker job（Windows / macOS）本来就下载它。当时 CI 与示例栈一起换成了 s3proxy。

s3proxy 是 Java 服务，没有 semver 标签（只能按 digest 钉），文件系统后端要先 `mkdir` 出 bucket 目录。CI 只需要一个「每个 job 起一次、job 结束就丢」的 S3：[fakes3](https://github.com/AkaraChen/fakes3) 是专为测试写的内存 S3，镜像约 7 MB、启动约 1 ms，`--auth` 下校验 SigV4（含 presigned URL），行为上贴近 AWS。

## Decision

1. **GitHub Actions `strategy.matrix.s3: [fakes3, juicefs]`**，`fail-fast: false`，每个后端一台 runner。
2. **CI 的通用 S3 后端用 fakes3**（`ghcr.io/akarachen/fakes3`）：`start-s3.mjs`、`ci.yml` 的 `s3` job、`action-test.yml` 的 Ubuntu `publish` / `tauri-updater`、Docker test 的 image job。容器带 `FAKES3_AUTH=1` 与 CI 默认凭证启动，签名错误一律 403，和 s3proxy 的 `aws-v4` 一样严格。
3. **按 release 标签钉镜像**（`ghcr.io/akarachen/fakes3:0.1.0`）。fakes3 发布 semver 标签，升级就是改 `start-s3.mjs` 里的一行。
4. **bucket 用 S3 API 创建**：fakes3 不落盘、启动时为空，`start-s3.mjs` 等 `GET /` 有响应后用 `curl --aws-sigv4` 发签名的 `PUT /<bucket>`。重复创建在 us-east-1 返回 200（AWS 的老行为），复用已在跑的容器也不会失败。
5. **示例栈仍用 s3proxy**：`deploy/compose.yaml` 与 Ansible playbook 是给运维照抄的交付物，需要持久化的 bucket；fakes3 只放内存，重启即丢。Docker test 的 compose / ansible job 测的正是这份示例，所以继续跑 s3proxy（按 digest 钉住，见 `compose.yaml`）。
6. **非 Docker job 继续用 MinIO 二进制**：fakes3 只支持 Linux（大对象放在 `memfd`），托管的 Windows / macOS runner 又没有 Docker。`start-minio.mjs` 从 GitHub release 下载固定版本，Windows / macOS action e2e 不改。MinIO 作为产品支持的 endpoint 仍有真实客户端覆盖。
7. **`.github/workflows/ci.yml` 的 `s3` job** 每条 PR / `main` 都跑：写探测（创建 app）、presigned PUT、finalize HeadObject、feed 302 下载。这是兼容性的最低保证。
8. **`action-test.yml` 的 Ubuntu `publish` / `tauri-updater` 同样 matrix**，在相关路径变更时用真实 electron-updater / plugin-updater 再走一遍。JuiceFS CI 网关沿用 `scripts/juicefs-dev.mjs` 的 `juicedata/mount` 镜像。

## Alternatives

- **继续用 s3proxy**：能用，但 Java 启动慢、无版本标签、bucket 靠 `docker exec mkdir`；它证明的 S3 语义 fakes3 都覆盖，且 fakes3 的 SigV4 / 错误码更贴近 AWS。
- **示例栈也换成 fakes3**：示例只剩一个镜像，但 bucket 与制品在 S3 容器重启后全部消失，不适合运维照抄。
- **fakes3 的 Node 包（`fakes3-sdk`）进程内启动**：省掉 Docker，但 Shukka 的 CI 脚本在 `pnpm install` 之前就要起 S3，而 Docker test 的容器也要按主机名访问它；镜像对两条路径都适用。
- **Linux 也改用 MinIO 二进制**：保留原语义，但把一次 GitHub release 下载加到每条 Linux PR；MinIO 仍由 Windows / macOS job 覆盖。
- **用镜像镜像站 / 第三方 MinIO 镜像**：供应链与维护责任都不在 MinIO 官方，CI 不该依赖。
- **只测 fakes3**：实现简单，但 JuiceFS 是向导里的一等选项，回归缺口正好落在用户会配的那条路径上。
- **两个独立 workflow**：触发条件与脚本会分叉；matrix 让「测哪些后端」成为一处清单。

## Trade-offs & failure bounds

- fakes3 不是生产对象存储：它证明 S3 语义，不证明 MinIO / R2 的运维特性。MinIO 的客户端行为由 Windows / macOS e2e 兜底。
- fakes3 把数据放内存（默认上限为机器内存的 75%，超出返回 507）；CI 上传的是几百 KB 的假制品，远低于上限。
- fakes3 容器重启后为空。CI 只重启 Shukka 容器，从不重启 fakes3；需要重来时重新跑 `start-s3.mjs`，它会补建 bucket。
- bucket 创建依赖宿主机的 `curl`（≥ 7.75，支持 `--aws-sigv4`）。GitHub runner 与常见开发机都满足；缺 curl 时脚本直接报错。
- 镜像来自个人 GHCR 命名空间（`akarachen`）。按标签钉住，升级要人工改 `start-s3.mjs`。
- 示例栈的 s3proxy digest 仍需人工更新，只改 `compose.yaml` 一处。
- JuiceFS job 首次要拉 `juicedata/mount:ce-v1.4.1`；镜像或 `juicefs gateway` 标志变更会红——这是要的。
- 两个后端共用默认凭证与 `releases` bucket 名，和本地开发约定一致。
- Windows 路径不证明 JuiceFS / fakes3；Linux matrix 才是它们的契约测试。
- `verify-feed.mjs` 每步 30s 超时并打印正在请求的 URL，避免某一步挂死占满 runner 且没有日志。
