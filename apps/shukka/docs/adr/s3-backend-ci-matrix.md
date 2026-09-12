# ADR: CI 用 Actions matrix 覆盖 MinIO 与 JuiceFS S3

## Context

面板把 MinIO 与 JuiceFS 都当作一等 S3 兼容后端（向导预设 path-style、JuiceFS 用 `juicefs gateway`）。上传、探测、feed 302 都依赖对方的 presigned URL 行为。原先 CI 只拉起 MinIO：JuiceFS 网关的差异（region 被忽略、bucket 由 `--bucket-name` 预置、健康检查仍走 `/minio/health/live`）不会在 PR 上被跑到。

## Decision

1. **GitHub Actions `strategy.matrix.s3: [minio, juicefs]`**，`fail-fast: false`，每个后端一台 runner。
2. **`.github/workflows/ci.yml` 的 `s3` job** 每条 PR / `main` 都跑：写探测（创建 app）、presigned PUT、finalize HeadObject、feed 302 下载。这是兼容性的最低保证。
3. **`action-test.yml` 的 Ubuntu `publish` / `tauri-updater` 同样 matrix**，在相关路径变更时用真实 electron-updater / plugin-updater 再走一遍。`publish-windows` 仍只用 MinIO：hosted Windows 无 Docker，JuiceFS CI 网关沿用 `scripts/juicefs-dev.mjs` 的 `juicedata/mount` 镜像。
4. **`.github/scripts/start-s3.mjs`** 按 matrix 值拉起后端；JuiceFS 委托给已有的 `scripts/juicefs-dev.mjs`，避免两套 format / gateway 参数。

## Alternatives

- **只测 MinIO**：实现简单，但 JuiceFS 是向导里的一等选项，回归缺口正好落在用户会配的那条路径上。
- **两个独立 workflow**：触发条件与脚本会分叉；matrix 让「测哪些后端」成为一处清单。
- **Windows 也跑 JuiceFS**：要另备非 Docker 的网关安装，和本机 dev 脚本不再同源。

## Trade-offs & failure bounds

- JuiceFS job 首次要拉 `juicedata/mount:ce-v1.4.1`；镜像或 `juicefs gateway` 标志变更会红——这是要的。
- 两个后端共用默认凭证与 `releases` bucket 名，和本地 `npm run juicefs` / MinIO 开发约定一致。
- Windows 路径不证明 JuiceFS；Linux matrix 才是 JuiceFS 的契约测试。
- `verify-feed.mjs` 每步 30s 超时并打印正在请求的 URL，避免某一步挂死占满 runner 且没有日志。
