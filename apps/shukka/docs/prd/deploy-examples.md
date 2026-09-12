# PRD: Compose 与 Ansible 部署示例

## Problem

部署指南把「一台 Docker + `/data` 卷」写成主路径，但仓库里没有可复制的 Compose 文件或 Ansible playbook。运维只能从 `docker run` 自己拼编排；拼错 hostname、漏挂卷或漏建 bucket 时，要到面板创建 app 才失败。

## Users

- **运维 / 管理员**：在一台已有 Docker 的主机上按文件启动，而不是从 README 抄命令。
- **CI**：用同一份文件拉起实例，走通 health → setup → 发版 → feed，防止示例与镜像脱节。

## Goals

1. 仓库提供一份 Compose 示例：Shukka + 可选的本机 MinIO，一块数据卷，镜像可覆盖。
2. 仓库提供一份 Ansible playbook：把那份 Compose 拷到主机并 `docker compose up`，等到 `GET /api/health` 为 ok。
3. README 与 `docs/prd/deploy.md` 指向这两份文件。
4. 现有 `.github/workflows/docker-test.yml` 增加 job，按文件原样拉起并走通主路径（不新开 workflow）。

## Non-goals

- 不把 MinIO 打进运行镜像。
- 不让 playbook 安装 Docker / 配 TLS / 管反向代理。
- 不做 Helm、K8s、多主机编排。
- 不在 Compose / Ansible job 上重复 electron-updater / Tauri；那仍由 image job 与 Action test 覆盖。
- 不把 Postgres 放进默认 Compose 文件；可选 overlay 见 `docs/prd/store-postgres.md`。

## Flows

### 运维：Compose

1. 主机已有 Docker Compose v2。
2. `docker compose -f apps/shukka/deploy/compose.yaml up -d`
3. `docker exec minio mkdir -p /data/releases`（示例 bucket）。
4. 打开面板 setup，创建 app 时填 Compose 文件头注释里的 MinIO 值。
5. 已有自己的 S3/R2 时删掉 `minio` 服务，镜像用 `SHUKKA_IMAGE` 钉版本。
6. 需要 Postgres 时叠加 `apps/shukka/deploy/compose.postgres.yaml`（默认文件仍是 sqlite）。

### 运维：Ansible

1. 主机已有 Docker Compose v2，控制机已有 ansible-core。
2. 按 `deploy/ansible/inventory.example` 写 inventory。
3. `ansible-playbook -i inventory.ini apps/shukka/deploy/ansible/playbook.yml`
4. Playbook 拷贝 Compose、启动、建 bucket、等到 health。之后与 Compose 流程相同。

### CI

1. `docker-test.yml` 用工作区根 context + `apps/shukka/Dockerfile` 构建 `shukka:test`（不推送）。
2. `compose` job：`SHUKKA_IMAGE=shukka:test` 按文件 `up`，走 health / setup / 发版 / feed / 重启后 feed 仍在。
3. `ansible` job：对 localhost 跑同一份 playbook（覆盖 image 与部署目录），再走同一条主路径。

## Failure behavior

- Compose / playbook 启动失败：容器或 health 达不到 ok，CI 红。
- MinIO 未就绪就建 bucket：playbook 重试 `docker exec`；CI 先 `wait-for` 再 mkdir。
- 示例未改、镜像坏了：与 `docker run` 的 image job 一样失败。

## Acceptance criteria

- [x] `apps/shukka/deploy/compose.yaml` 与 `apps/shukka/deploy/ansible/playbook.yml` 在仓库里。
- [x] README 与 `docs/prd/deploy.md` 提到这两份文件。
- [ ] `docker-test.yml` 的 compose / ansible job 用同一套 provision → publish → verify-feed 脚本走通主路径。
- [x] 不新增 workflow 文件。

## Resolved product decisions

- 示例带 MinIO，方便本机走完整发版；生产对象存储仍按 app 在面板配置。
- Ansible 只编排已有的 Compose 文件，不另写一套 `docker run`。
- 验证加在已有 Docker test workflow，不并进 `ci.yml`，不新开 workflow。
