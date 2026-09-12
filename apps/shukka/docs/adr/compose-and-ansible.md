# ADR: 用仓库内 Compose + Ansible 示例部署，并在 Docker test workflow 里走通

## Status

Accepted.

## Context

推荐分发仍是 `ghcr.io/shukka-app/shukka` + `/data` 卷（[self-host-runtime](self-host-runtime.md)）。[deploy](../prd/deploy.md) 曾把 Compose 留给运维自写。[docker-image-ci](docker-image-ci.md) 已用 `docker run` 走通镜像主路径。运维还要一份可复制的编排文件，以及证明「按文件启动」与 `docker run` 同一条 HTTP 主路径。

## Decision

1. **示例放在 `apps/shukka/deploy/`**：`compose.yaml` 跑 Shukka + MinIO；`ansible/playbook.yml` 把该文件拷到主机并 `docker compose up`。镜像通过 `SHUKKA_IMAGE` / `shukka_image` 覆盖，Compose **不**写 `build:`——playbook 只拷编排文件，远端没有 Dockerfile 上下文。
2. **Ansible 只用 builtin 模块**（`command` / `copy` / `file` / `uri`）。Docker 与 Compose v2 是前置条件，playbook 不装引擎。
3. **验证加在已有** `.github/workflows/docker-test.yml`：`compose` 与 `ansible` 两个 job，复用 `provision.mjs`、`fake-release.mjs`、`shukka-upload.mjs`、`verify-feed.mjs`、`assert-container.mjs`。不新开 workflow，不并进 `ci.yml`。
4. **这两个 job 不跑 electron-updater / rollback**。镜像契约与 updater 仍由同 workflow 的 `image` job 覆盖。
5. **MinIO 主机名仍是 `minio`**，与 image job 相同：runner `/etc/hosts` 指向 `127.0.0.1`，presigned URL 从容器和 runner 都能解析。Compose 网络提供容器侧 DNS；不再用 `--add-host minio:host-gateway`。

## Alternatives

- **新开 `deploy-examples.yml`**：多一个要盯的 workflow，和 Docker test 重复构建；拒绝。
- **并进 `ci.yml`**：每次 lint 都等镜像构建；与 [docker-image-ci](docker-image-ci.md) 同一理由拒绝。
- **Playbook 直接 `docker run`**：与运维复制的 Compose 示例分叉；拒绝。
- **Compose 写 `build: .`**：Ansible 拷到 `/opt/shukka` 后上下文不是仓库根；拒绝。
- **community.docker collection**：多一个要 pin 的 collection；`docker compose` 命令足够。

## Trade-offs & failure bounds

- 示例默认带 MinIO，方便本机发版；生产应用自己的 bucket 时要删掉该服务。
- compose / ansible job 各建一次镜像，换墙钟时间几乎仍由 `image` job 决定，多消耗构建分钟数。
- Playbook 不安装 Docker：没有引擎的主机在「Check that Docker Compose is available」失败。
- `container_name: shukka` / `minio` 固定名称，单主机不能并排跑两份示例栈。
