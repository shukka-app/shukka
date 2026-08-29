# ADR: PR 上构建运行镜像并走通容器内主路径，不推送

## Status

Accepted.

## Context

推荐分发是仓库根 `Dockerfile` 产出的 `ghcr.io/shukka-app/shukka`（[self-host-runtime](self-host-runtime.md)、[ghcr-on-semver-tag](ghcr-on-semver-tag.md)）。CI 的 `s3` / Action test 在 runner 上 `npm run build && npm start`，不经过镜像。`docker.yml` 只在 `main` 与 semver 标签上构建并推送，PR 不发镜像，也没有人在合并前跑过「按文档 `docker run` 之后的进程」。镜像层（Alpine 运行时、Nitro 追出的 libsql、`/data` 卷、非 root）坏了要到发布后才发现。

## Decision

1. **单独的 workflow** `.github/workflows/docker-test.yml`（不并进 `ci.yml` 或 `docker.yml`）。职责是：用根 `Dockerfile` 构建、按 README / deploy 文档的 `docker run -p 3000:3000 -v …:/data` 启动、走通容器内主路径；同一 workflow 再按 `deploy/compose.yaml` 与 `deploy/ansible/playbook.yml` 拉起示例栈并走通 health / setup / 发版 / feed。不 login、不 push、不打多架构。
2. **触发**：`main` / PR 在 Dockerfile、应用源码、`drizzle/`、lockfile、`deploy/`、本 workflow 或它调用的脚本 / e2e 变更时跑；`workflow_dispatch` 可手动。纯无关文档 PR 不跑。
3. **复用已有脚本**，不在 YAML 里重写业务：`start-s3.mjs`、`provision.mjs`、`fake-release.mjs`、`shukka-upload.mjs`、`verify-feed.mjs`、`tests/e2e/run.mjs`、`run-rollback.mjs`。容器契约（health、uid 1000、`/data` 文件、可选「未初始化」session）放 `.github/scripts/assert-container.mjs`。
4. **S3 用 MinIO + 主机名 `minio`**。创建 app 时写入的 endpoint 会出现在 presigned URL 上，必须从容器（写探测 / HeadObject）和 runner（PUT / 下载）都能解析。CI 把 `minio` 写进 runner 的 `/etc/hosts`，容器加 `--add-host minio:host-gateway`。不测 JuiceFS：那是 S3 兼容面，不是镜像契约。不测 Tauri：Rust 工具链与镜像无关，仍由 Action test 覆盖。
5. **先证明卷，再跑 updater**。发版并校验 feed 后 `docker restart`，确认 health、`/data` 与同一版本 feed 还在，然后才跑 electron-updater / rollback（rollback 会改 currentVersion）。

## Alternatives

- **只在 `docker.yml` 里加一个 load-and-curl job**：和推送抢同一条多架构 QEMU 构建，PR 仍然不跑；拒绝。
- **并进 `ci.yml`**：每次 lint/test 都等一次镜像构建；镜像测试的失败语义（容器、卷、HEALTHCHECK）与单元测试不同，单独 workflow 更清楚。
- **`--network host`**：更少 hostname 技巧，但测的不是文档里的 `-p 3000:3000`，也掩盖「S3 是另一台主机」这条生产约束。拒绝。
- **QEMU 再测 `linux/arm64`**：发布面已由 `docker.yml` 构建；本 job 要的是跑通流程，不是仿真另一个架构。拒绝。

## Trade-offs & failure bounds

- 只跑 runner 原生架构（`linux/amd64`）。arm64 预构建或 musl 绑定坏了要到本机 / 发布构建才露出。
- 镜像构建冷启动约数分钟；`concurrency` 取消同 ref 的旧 run。
- 不推送：GHCR 上不会出现 PR 垃圾 tag；合并后仍靠 `docker.yml` 发 `latest` / semver。
- `host-gateway` 与改 `/etc/hosts` 是 GitHub-hosted Linux runner 的细节，不是给运维复制的部署步骤。
