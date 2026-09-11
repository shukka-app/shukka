# PRD: Shukka update platform

## Problem

Electron 应用用 electron-updater + S3 做自更新时，缺少一个管理面：发版靠手写脚本拼 S3 key，多 app、多 channel、多平台的制品和 `latest*.yml` 布局全靠约定，没有发版记录、没有下载可见性、CI 集成每个项目重复造轮子。

Shukka 是一个自托管的发版管理器：面板管理 app / channel / 版本，API key 供 CI 上传，公开的更新 endpoint 直接供 electron-updater 消费。

## Users

- **管理员**（唯一面板用户）：部署 Shukka 的开发者本人，创建 app、配 S3、建 channel、发 key、看版本与下载数据。
- **CI（API key 持有方）**：GitHub Actions 等自动化流程，向绑定的 app 上传版本，并可经 App API 操作该 app 内资源（见 `docs/prd/app-api.md`）。
- **终端应用（匿名）**：安装了 electron-updater 的桌面应用，无凭证读取更新 feed 并下载制品。

## Goals

1. 面板创建 app，每个 app 独立配置 S3（endpoint、region、bucket、prefix、access key/secret，支持 AWS/R2/MinIO 等兼容实现）。
2. app 下自由命名的 channel（创建 app 时默认创建 `stable`），版本直接发布到某个 channel。
3. 每个 API key 绑定单个 app；明文仅创建时展示一次；可吊销。
4. 版本上传走 presigned URL 直传 S3：init（鉴权、领 presigned PUT）→ 直传 → finalize（校验、解析 yml、落版本记录）。默认 draft，不切 current；`release: true` 才原子切换当前版本。事后 promote 见 `docs/prd/draft-releases.md`。
5. 透传 electron-builder 产物：制品 + `latest*.yml` + `*.blockmap` 原样上传，Shukka 解析 yml 建记录，不自行生成更新元数据；mac/win/linux 多平台由产物天然覆盖。
6. 无鉴权更新 endpoint：每个 app+channel 一个 feed base URL，yml 由 Shukka 返回（当前版本），制品 302 到 S3；与 electron-updater generic provider 完全兼容。
7. 面板提供每个 channel 的 feed URL 和可复制的 electron-builder `publish` / electron-updater 配置片段。
8. 基础下载计数：按版本记录 yml 拉取次数与制品 302 次数，面板展示。
9. 面板认证：首次启动引导设置管理员密码（存 hash），登录换 session，面板内可改密。
10. 配套 GitHub JavaScript action（`apps/shukka/action.yml` 以 runner Node 直接执行 `scripts/shukka-upload.mjs`；`uses: shukka-app/shukka/apps/shukka@v2`），用 actionlint 检查，并在 Ubuntu / Windows runner 上验证。
11. 仓库内提供 agent skill，指导 agent 通过 Shukka API 完成建 app / 建 channel / 发 key / 上传发版等操作。

## Non-goals

- 多用户、团队、多租户、任何形式的注册。
- 灰度发布（stagingPercentage）、回滚编排——channel 当前版本可手动指回旧版本即可。
- 生成或改写 electron-updater 元数据；Squirrel.Windows、自建差分。
- 制品代理传输：Shukka 不中转制品字节，上传下载都直连 S3。
- 下载分析报表（地域、版本迁移曲线、去重用户等）；命中随时间的趋势图见 `docs/prd/hit-trends.md`。

## Flows

### 管理员：初始化与建 app

1. 首次打开面板 → 设置管理员密码 → 登录。
2. 新建 app：名称、slug、S3 配置 → 保存时校验 S3 连通性（可写探测）。
3. app 详情页默认有 `stable` channel，可增删 channel、看每个 channel 的 feed URL 与配置片段、创建/吊销 API key。

### CI：上传版本

1. `POST /api/v1/upload/init`，Bearer API key，携带 channel、version、文件清单（名称/大小）→ 得到每个文件的 presigned PUT URL。目标 channel 不存在时默认拒绝，除非显式传 `createChannel: true`。
2. 逐个 PUT 直传 S3。
3. `POST /api/v1/upload/finalize` → Shukka 校验对象存在、解析 yml、创建版本记录。默认不切 current；带 `release: true` 才把 channel 当前版本指向它。
4. 任一步失败返回类型化错误；finalize 前的半成品上传、以及成功的 draft，都不影响 channel 当前版本。

### 终端应用：检查更新

1. electron-updater 以 `{server}/api/update/{appSlug}/{channel}` 为 generic feed base，请求 `latest.yml` / `latest-mac.yml` / `latest-linux.yml`（或自定义 channel 命名的 yml）。
2. Shukka 返回该 channel 当前版本对应的 yml 原文；请求制品文件名时 302 到 S3。
3. 每次 yml 命中与制品 302 计入对应版本计数。

## Acceptance criteria

- [x] 未登录访问面板任意管理页被重定向到登录/初始化页；更新 endpoint 与上传 API 不受面板 session 影响。
- [x] 创建 app 时 S3 配置校验失败给出明确错误，不落库半成品。
- [x] API key 明文只在创建响应中出现一次；数据库中只有 hash；吊销后立即 401。
- [x] 用 A app 的 key 向 B app 上传返回 403。
- [x] 完整上传一份含 Windows / macOS / Linux 元数据的 electron-builder 形产物后，宿主平台上的 electron-updater（generic provider）能 check 到新版本并完成制品下载与 sha512 校验（跟随 302）。不覆盖 `quitAndInstall` / 真机替换。
- [x] finalize 之前 channel 的 feed 始终返回旧版本；仅 `release: true` 的 finalize 或事后 promote 之后返回新版本（见 `docs/prd/draft-releases.md`）。
- [x] 同一 channel 重复上传同一 version 被拒绝（除非先在面板删除该版本）。
- [x] 面板 app 列表、channel 列表、版本列表、下载计数、feed URL、配置片段均可见；UI 为 shadcn sidebar 应用壳。
- [x] `action.yml` 通过 actionlint；GitHub-hosted Ubuntu 与 Windows runner 跑通示例 workflow 完成一次真实上传（对本地 MinIO + 本地 Shukka）。
- [x] agent skill 描述的每个 API 调用与实现一致。
