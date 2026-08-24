# Specification

## Product scope

Shukka 是一个自托管的桌面应用发版管理器：管理面板 + 上传 API + 面向 Electron / Tauri 更新客户端的无鉴权 feed，制品存储在每个 app 自配的 S3 兼容存储中。

Out of scope until explicitly specified: anything not yet accepted in a PRD.

## Terminology

- **App**: 一个被管理的桌面应用，拥有唯一 slug、一种更新系统（`updaterKind`：`electron` 或 `tauri`）、一套独立 S3 配置、若干 channel 与 API key。kind 在创建时选定，之后不改。
- **Channel**: app 下的发布通道（app 创建时默认含 `stable`），任一时刻指向至多一个**已发布**当前版本。`name` 为 URL token：`^[a-z0-9][a-z0-9_-]{0,62}$`，不是任意文本。
- **Version**: 一次 finalize 成功的发版记录，属于单个 channel，由制品文件与更新元数据文件组成。`releasedAt` 为空则为 **draft**（对公开面隐身）；非空则为已发布。
- **Draft version**: finalize 成功但尚未 promote / 未带 `release: true` 的版本；有 `createdAt`，无 `releasedAt`。
- **Artifact**: 版本内的一个文件（安装包、`*.blockmap`、`latest*.yml`、Tauri `.sig` / `latest.json` 等），原样来自该 app 更新系统的构建产物。
- **Installer**: 面板按文件名识别出的桌面安装包（`.exe` / `.msi` / `.dmg` / `.AppImage` / `.deb` / `.rpm` / `.app.tar.gz`，以及带 mac 标记的 `.zip`）。不是 Artifact 的存储类型；yml、`.blockmap`、`.sig`、`latest.json` 不是 installer。
- **Feed**: 某 app+channel 的无鉴权更新读取面，base URL 为 `/api/update/{appSlug}/{channel}`。文档形状由该 app 的 `updaterKind` 决定。
- **Update adapter**: 一种更新客户端契约的服务端实现（上传校验、feed 文档、平台识别、接入文档）。Electron 与 Tauri 各一份。
- **API key**: 形如 `shk_<random>` 的凭证，绑定单个 app；可上传并操作该 app 内资源，不可删 app 或管理 key。
- **Pending upload**: init 之后、finalize 之前的上传事务，对 feed 不可见。
- **Hit bucket**: 按 version × kind（metadata/artifact）× UTC 小时预聚合的命中计数；随所属 version 级联删除，永久保留。
- **Release note**: 挂在单个 version 上的可变元数据，按 locale（BCP-47）一条一记；源文为 Markdown，读取面同时提供 `markdown` / `html`（消毒）/ `text` 三种表示；随所属 version 级联删除。
- **Locale fallback chain**: notes 查询的 locale 解析顺序——请求 locale 精确匹配 → app 配置的回退 locale（缺省 `en-US`）→ 第一个可用 locale → 该版本省略 note。比较按 BCP-47 规范化形式进行（`en-us` 与 `en-US` 视为同一 locale）。
- **Locale**: 面板 UI 语言，`en`（源语言与回退）或 `zh`；per-browser 存于 cookie。
- **Theme preference**: 面板明暗主题偏好（light / dark）；per-browser 存于 cookie，无记录时跟随系统。
- **View role**: 面板视图角色（admin / developer / content）；per-browser 存于 cookie，仅控制面板 UI 入口可见性，纯前端，无鉴权语义。
- **Data directory**: 服务持久化根目录（默认 `./data`，`SHUKKA_DATA_DIR` 可改；容器内默认 `/data`），含 SQLite 文件与自动生成的 S3 加密密钥。整目录即备份边界。
- **Feature 质问**: the mandatory product-then-technical clarification loop driven by `$feature-dev` before implementation.
- **PRD / ADR / Spec**: see documentation harness below.
- **Runtime image**: GHCR 上的可部署镜像 `ghcr.io/{owner}/{repo}`（规范仓库为 `ghcr.io/shukka-app/shukka`），由 semver git 标签发布，与面向桌面应用的 GitHub JavaScript action 不是同一条发布面。

## Observable contracts

### Update feed（无鉴权）

- `GET /api/update/{appSlug}/{channel}/{artifactName}` 对 channel 内**已发布**版本（`releasedAt` 非空）的制品按文件名解析，302 到短时效 S3 URL；draft 的文件名与不存在相同，返回 404。同名制品跨版本存在时，当前版本优先，其余按 `releasedAt` 最新优先解析。
- **Electron**：`GET .../{metadataFile}.yml` 返回当前版本中同名 yml 的原文（不改写）。客户端默认请求 `latest.yml` / `latest-mac.yml` / `latest-linux.yml`。把 Shukka channel 名写进 electron-builder `publish.channel` 会改成请求 `stable.yml` 等，除非产物里真有这些文件。
- **Tauri**：`GET /api/update/{appSlug}/{channel}` 与 `GET .../latest.json` 返回为当前已发布版本生成的静态 updater JSON（`platforms` 映射；`url` 指向本 feed 下的制品；`signature` 为对应 `.sig` 正文）。无当前版本时 404。
- 元数据是否原文透传是 adapter 不变量，不是全系统不变量。
- yml 命中与制品 302 分别计入所属版本的下载计数；每次命中在计数器递增的同一事务内 upsert 其 UTC 小时 hit bucket。

### Release notes（无鉴权）

- `GET /api/v1/apps/{appSlug}/channels/{channel}/notes?from&to&locale` 返回该 channel 内**已发布**版本按 `releasedAt` 排序的版本段 notes：`from` / `to` 为版本字符串，`from` 含、`to` 不含；`from` 为空时返回最新 10 个带 note 的已发布版本。Draft 不出现。
- 响应为 `{ notes: [{ version, releasedAt, locale, markdown, html, text }] }`；每个版本的 note 按 locale fallback chain 解析到单一 locale，链穷尽则该版本省略 note。
- 与 feed 同一信任模型：无鉴权；错误响应同一信封 `{ error, message }`。App 未启用 release log 时不返回数据。

### Upload API（Bearer API key）

- `POST /api/v1/upload/init`：body 含 `channel`、`version`、文件清单；返回 pending upload id 与每文件 presigned PUT URL。同 channel 已存在同 version（含 draft）时拒绝。文件清单必须通过该 app adapter 的元数据要求（Electron：至少一个 `.yml`；Tauri：`latest.json` 和/或成对的制品 + `.sig`）。
- 目标 channel 不存在时默认拒绝；只有显式 `createChannel: true` 才创建，避免拼写错误静默产生新 channel。新 channel 名必须符合 channel name 规则。
- `POST /api/v1/upload/finalize`：校验对象齐全（含声明大小）后创建版本。默认 **draft**（不改 current）。`release: true` 时同时写入 `releasedAt` 并原子切换 current。声明了 `version` 的元数据（Electron yml、Tauri `latest.json`）须与上传版本一致；`.sig` 不声明 version，不做此项校验。
- 过期的 pending upload 在下次触达（同 app 的 init/finalize）时清除，其已写入的对象一并删除（尽力而为）。
- API key 与 app 不匹配返回 403；key 已吊销或无效返回 401。

### App API（`/api/v1/apps/{appSlug}`）

- 对外标识为 app slug、channel name、version 字符串；不暴露数字 id。
- 鉴权：session 或绑定该 slug 的 API key（`requireAppActor`）。Key 可改 app 的 `name`；slug 与存储配置字段为 session-only（key 提交未变更的原值不视为修改）。存储位置（endpoint/bucket/prefix）变更时，若 app 已有制品，服务端会探测最新制品在新位置是否存在，缺失则拒绝保存。Key 还可 CRUD channel / version / note、设 `currentVersion`、读详情与趋势、按版本+文件名领取制品。Key 不可删 app、不可管理 API key。`GET /api/v1/apps/{appSlug}` 仅对 session actor 返回 `keys`；以 API key 鉴权时省略该属性。
- `GET .../channels/{channel}/versions/{version}/artifacts/{filename}`：对该版本（含 draft）已存文件 302 到短时效 S3 URL；不计入命中。文件不在该版本上 → 404。公开 feed 的 draft≡404 与命中规则不变。
- `PATCH .../channels/{channel}` 设 `currentVersion`：目标为 draft 时在同一事务写入 `releasedAt` 再切指针（promote）；目标为已发布版本则只切指针（回滚）。
- 实例级（列/建 app、登录改密、存储探测）与 API key CRUD 仅 session，不在 key 能力面。
- 公开 API 文档（`/api/v1/openapi.json`，经 `/docs` 渲染）只展示 API key（或 session）可调用的操作与公开 feed/notes；session-only 管理操作（删 app、API key 生命周期、实例级路由）不在文档中。
- 面板 app 详情 **API docs** 入口打开 `/docs`：server route 用 cheerio 把本地 `redoc` standalone bundle 内联进自建 HTML 模板，`Redoc.init` 以 `specUrl` 让浏览器同源 fetch `/api/v1/openapi.json`（带 session cookie），整页无侧栏与顶栏（admin / developer）。HTML 静态、与 origin 无关，进程内组装一次缓存。点击在新浏览器标签打开，当前页标签不切换。未登录重定向到登录。Integration 的 HTTP API 接入说明提供同样打开新标签的按钮。
- 制品字节永不经过 Shukka 进程（上传直传 S3，下载 302）。
- 错误响应统一为 `{ error, message }`，`error` 取自固定码集：`unauthorized`、`forbidden`、`not_found`、`conflict`、`invalid_request`、`storage_error`、`metadata_error`、`rate_limited`。

### Health（无鉴权）

- `GET /api/health` 公开无鉴权，不依赖任何 app / channel / 登录态或 S3 配置；未初始化实例也返回 200。
- 执行一次 SQLite 轻量查询（`SELECT 1`）作为依赖探针；成功返回 `200 { status: "ok", db: "ok" }`，SQLite 抛错返回 `503 { status: "degraded", db: "down" }`（不走业务错误信封 `{ error, message }`，不泄内部错误文本）。响应 `cache-control: no-store`。
- 不探 S3（配置 per-app，无默认实例可探）；不在 `/api/v1/openapi.json` 公开文档中，与 session-only 管理路由同一处理。

### Panel

- 除 setup/login 外的面板路由、`/docs` 与管理 API 均要求 session；未认证重定向到登录（未初始化时重定向到 setup）。
- `POST /api/admin/login` 对每个来源 IP 的失败尝试做 15 分钟固定窗口限速（10 次）；超限返回 `rate_limited`（429）。成功登录重置该 IP 计数。`X-Forwarded-For` / `X-Real-IP` 仅在 `SHUKKA_TRUST_PROXY` 为 `1` 或 `true` 时采信（取最右一跳）；未设置时所有直连客户端共用一个桶。同一窗口内合计超过 100 次失败则对所有来源返回 `rate_limited`；成功登录不重置该全局窗口。
- `POST /api/admin/storage/test` 对提交的 S3 配置做写探测（Put+Delete 探针对象）并返回 `{ ok: true }`，不落库；创建与编辑 app 保存前服务端始终重复同一探测，失败拒绝保存。
- API key 明文仅在创建响应中出现一次，此后不可再取得。
- S3 secret access key 加密存储，密钥在服务数据目录中自动生成。
- 语言切换入口：setup / login 页右上角为独立切换器；面板页收进侧栏底部的角色菜单。locale 存 cookie，SSR 首屏 `<html lang>` 即正确。
- 主题切换在侧栏底部的角色菜单内（设置页的 Appearance/Account 分区拆分暂缓，设置页保持仅修改密码）；默认跟随系统，显式选择与系统相反时记忆（存 cookie），与系统一致时恢复跟随；SSR 首屏 `<html>` 即带与 cookie 一致的类与 `color-scheme`，无 cookie 时由 pre-paint 脚本按系统偏好绘制——首屏无主题闪烁。
- 服务端错误按 `error` 码在客户端翻译，未命中回退服务端英文 message；日期与相对时间按当前 locale 格式化。
- Integration 标签页的 agent 发布方式展示一条 `npx skills add` 命令：安装仓库内 `skills/shukka-publish/` 的发布 skill，URL 固定到构建时注入的 git commit（无 git 元数据时回退 `main`）；skill 为通用协议文档，不含任何 server/app/channel/key 事实。
- 侧栏底部为单一角色菜单按钮（当前角色名）：菜单内含视图角色切换、语言切换、外观（Light/Dark）切换、设置入口（仅 admin）与退出登录。
- 趋势接口：`GET /api/v1/apps/{appSlug}/channels/{channel}/trend?range=7|30|90` 与 `GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend`，session 或绑定该 app 的 API key；channel 趋势按 UTC 小时（7 天）或 UTC 天（30/90 天）聚合，版本趋势为发布后 14 个 UTC 天（未来日期省略，draft 返回空序列）；面板入口对 admin 与 content 角色可见，developer 隐藏。
- 视图角色只隐藏面板 UI 入口，不是鉴权：直接访问 URL 不被拦截，服务端不存、不校验角色。可见性矩阵——content：应用列表 + app 详情的 Channels 标签（版本表含 draft 标记、下载/检查计数、趋势图、版本统计入口）与 Settings 标签（仅 Release log 分区），另含版本 release notes 编辑（app 启用 release log 时），无 promote / 版本安装包下载 / 新建 channel / 新建应用 / 设置入口 / Integration / API docs；developer：另有 Integration、API docs（ReDoc）、API keys、新建 channel、新建应用、promote、历史行安装包下载弹窗、app Settings（编辑表单与 Release log 分区；删除应用区块仍仅 admin），不见趋势图、版本统计入口与 release notes 编辑入口；admin：全部，另含删除应用与设置页入口。
- Channels 历史行的安装包弹窗只渲染 installer 瓷砖（平台图标 + 架构 + 扩展名）；该版本没有可识别安装包时按钮仍在、弹窗为空状态。下载走 App API 302，不计命中。
- Release log：创建应用向导第 3 步配置启用开关、locale 列表与回退 locale；app 设置页含「Release log」分区（左侧导航驱动，nuqs `section` 参数）；Channels 标签页历史行在 app 启用时提供 notes 编辑入口，跳转到独立编辑页面 `/apps/{appSlug}/notes/{version}`（Milkdown 所见即所得编辑器，按 locale 切换，编辑器变量映射面板主题 token）。配置与 note 编辑走 `/api/v1/apps/{slug}/...`（不触发 S3 存储探测）；note 的 PUT 为 upsert。
- 面板 app 详情路由为 `/apps/{appSlug}`，不再使用数字 id。
- 创建向导第一步选择 `updaterKind`（Electron / Tauri，必选、不预选）并填写名称 / slug；未手改 slug 时由名称经拼音 + GitHub Slugger 自动生成。kind 创建后不改，Settings 不展示。Integration 文案与 snippet 随 `updaterKind` 切换。

### Runtime（自托管进程）

- 面板、`/api/admin`、`/api/v1`、`/api/update` 同一 Node 进程、同一 HTTP 端口。默认端口 `3000`（`PORT` 或 `NITRO_PORT`）。
- 所有 HTTP 响应带 `X-Frame-Options: DENY`、CSP `frame-ancestors 'none'`、`X-Content-Type-Options: nosniff`、`Referrer-Policy: same-origin`；不设含 `script-src` 的严格 CSP（面板与 `/docs` 有内联脚本）。
- 启动时若进程 cwd 下存在 `drizzle/`，对 SQLite 自动 migrate；生产不跑 `db:generate`。
- `GET /api/admin/session` 无需鉴权，返回 `{ initialized, authenticated }`，作为进程探活（不是独立 `/health`）。
- 管理员密码不从环境变量读取：未初始化时面板走 setup；忘记密码的恢复路径是删除 `admin`（及 `sessions`）行后重走 setup。
- S3 凭证按 app 存在库中，不是进程环境变量。进程环境只影响监听地址与数据目录（见 `docs/prd/deploy.md`）。
- 同一数据目录同一时间只有一个写进程。

### GitHub Action

- 仓库根 `action.yml` 为 JavaScript action（`using: node24`，`main: scripts/shukka-upload.mjs`），inputs：`server-url`、`api-key`、`app`、`channel`、`version`、`directory`、`create-channel`、`release`（默认 false，对应 finalize 的 draft；`true` 则立即上线）；将目录内构建产物完整发布为一个版本，outputs 为 `version` 与 `channel`。`version` 留空时从目录内 `latest*.yml` 或 Tauri `latest.json` 读取。不调用 bash / pwsh / cmd。
- `action.yml` 与仓库 workflow 必须通过 actionlint。
- Action e2e 必须在 GitHub-hosted `windows-latest` 上跑通同一条发布路径（init → 直传 → finalize → feed → 宿主平台 electron-updater）。
- Feed e2e：在真实 MinIO + 已发布版本上，用 Electron library 拉起 `electron-updater`（generic provider）做 check + download + sha512；另用真实 Tauri 进程拉起 `tauri-plugin-updater` 做 check + download + minisign。两者都不测安装。回退 e2e（`tests/e2e/run-rollback.mjs`）连续发布两版后 `PATCH currentVersion` 指回旧已发布版本，确认 feed 与 electron-updater 看到旧版本，被切走的已发布制品仍按文件名 302。见 `docs/adr/electron-updater-e2e.md`、`docs/adr/tauri-updater-e2e.md`。

### Runtime image

- 推送 git 标签 `vMAJOR.MINOR.PATCH`（可带预发布后缀）会把仓库根 `Dockerfile` 构建的镜像发布到 `ghcr.io/{owner}/{repo}`。PR 不发镜像；`main` 继续发 `latest` 与 `sha-*`。
- 正式版镜像 tag：`{version}`、`{major}.{minor}`、major ≥ 1 时的 `{major}`，以及 `latest`。预发布只发布 `{version}`（含后缀），不移动 `latest` 或 major/minor 浮动 tag。major 为 0 时不发布 `:0`。
- 公开仓库的镜像可匿名拉取。构建失败不推送。见 `docs/prd/container-image.md`、`docs/adr/ghcr-on-semver-tag.md`。
- PR 与 `main` 上的 `.github/workflows/docker-test.yml` 用仓库根 `Dockerfile` 构建镜像（不推送），按 `docker run -p 3000:3000 -v …:/data` 启动，走通 health、首次 setup、发版、feed、卷在重启后仍在、以及 host-platform electron-updater / rollback。同一 workflow 还按 `deploy/compose.yaml` 与 `deploy/ansible/playbook.yml` 拉起示例栈，走通 health、setup、发版、feed 与重启后 feed 仍在（不重复 updater）。见 `docs/adr/docker-image-ci.md`、`docs/adr/compose-and-ansible.md`。

## System-wide invariants

- 一个 version 恰属于一个 channel；同 channel 内 version 字符串唯一（draft 与 released 共用此唯一性）。
- Channel 当前版本必须是已发布版本；切换是原子的：feed 读到的要么整套旧已发布版本、要么整套新已发布版本。
- finalize 失败、未发生、或成功但为 draft 时，channel 当前版本与 feed 输出不变。
- 版本制品一经 finalize 不可修改，只可删除（删除会清理 S3 对象；若删的是 current 则回退到剩余最新**已发布**版本，无则清空）。`releasedAt` 一旦非空不可改回空。Release note 是挂在版本上的可变元数据，draft 与 released 都可编辑，不改变版本记录本身。
- Release note 的 `html` / `text` 是写时渲染产物（渲染器升级不回溯已存产物；`html` 经消毒，源文中的原始 HTML 被剥离）；随所属 version 删除级联清除。
- 数据库中不存任何明文 secret（管理员密码存 hash，API key 存 hash，S3 secret 加密）。
- 元数据在 SQLite（data directory，可用 `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` 指定），加密密钥同目录自动生成（`SHUKKA_KEY_PATH` 可改路径）；data directory 整体即完整备份边界——缺密钥则无法解密已存 S3 secret。
- 单个 Node 进程承载全部 HTTP 面；同一 SQLite 文件不可被多个 Shukka 进程同时写。
- S3 对象键布局固定为 `{prefix}/{channel}/{version}/{filename}`；制品文件名不含路径分隔符。
- 删除 version、channel 或 app 都会同时删除其拥有的 S3 对象；删除 current version 还会把 channel 当前版本回退到剩余最新**已发布**版本（无剩余则清空）。
- `version` 字符串与制品文件名都不得含路径分隔符或 `..`，保证对象键始终落在文档化的布局内。
- 自本功能部署起，版本计数器恒等于其同 kind hit bucket 之和（部署前的历史计数无 bucket 回溯）；bucket 随 version 删除级联清除。只有公开 feed 的 yml 命中与制品 302 计入计数器；App API 的制品 302 不计。
- 面板 UI 字符串全部来自类型化字典：en 为源语言，其余语言字典与 en 编译期键对齐（缺键即类型错误）。
- 语言、主题与视图角色偏好是 per-browser cookie；服务端不存任何用户偏好。

## Documentation harness

- **PRD**: a product requirements document under `docs/prd/` describing problem, users, goals, non-goals, flows, failure behavior, and acceptance criteria.
- **ADR**: an architecture decision record under `docs/adr/` capturing one material technical choice, alternatives, and consequences.
- **Spec**: this file — the single source of truth for shared terminology, observable contracts, and system-wide invariants.
- New product behavior is defined in `docs/prd/` before feature code lands; material technical choices land in `docs/adr/` before or with the code that depends on them; stable implementation-independent rules merge into this file in the same change set.
- Agents must not implement feature code during 质问; the accepted PRD/ADR/spec set is the source of truth for implementation.

## System-wide constraints

- Repository agent entrypoint is root `AGENTS.md` (`CLAUDE.md` is a symlink to it).
- Feature development workflow skill lives at `.agents/skills/feature-dev/` (also linked from `.claude/skills/`).
- Self-host operator guide lives at `docs/prd/deploy.md`; Compose / Ansible examples at `deploy/` (`docs/prd/deploy-examples.md`); runtime choice at `docs/adr/self-host-runtime.md`.
- Platform operation skill lives at `.agents/skills/shukka-ops/`; it must stay consistent with the HTTP contracts above.
- Publish protocol skill lives at `skills/shukka-publish/` (installable via the skills CLI); it is generic — no per-server/app/channel facts — and must stay consistent with the upload API contract above.
- Commit attempts should re-check the working tree against this specification and relevant PRDs/ADRs before landing.

## Current implementation status

- Update platform implemented per `docs/prd/update-platform.md` and the ADRs in `docs/adr/`.
- Draft releases and the slug-based App API implemented per `docs/prd/draft-releases.md`,
  `docs/prd/app-api.md`, `docs/adr/draft-released-at.md`, and `docs/adr/app-api-v1.md`.
- Panel, instance-level admin API, `/api/v1` App API, upload API and update feed live in one
  TanStack Start app (`src/routes/`), with domain services in `src/server/` and infrastructure
  in `src/lib/`. Nested `/api/admin/apps/:id` routes are gone.
- GitHub Action is a node24 JavaScript action at repository root `action.yml` + `scripts/shukka-upload.mjs`; agent skill at
  `.agents/skills/shukka-ops/`.
- Verified end to end against MinIO: publish through the action, HTTP feed + 302, a
  host-platform `electron-updater` check/download, and channel rollback via
  `PATCH currentVersion` (`tests/e2e/`, `docs/adr/electron-updater-e2e.md`).
- Updater adapters: App `updaterKind` (`electron` | `tauri`) per `docs/prd/updater-adapters.md`
  and `docs/adr/updater-kind-on-app.md`; Tauri process check/download per
  `docs/adr/tauri-updater-e2e.md`.
- Self-host deploy documented per `docs/prd/deploy.md` and `docs/adr/self-host-runtime.md`
  (Docker + persistent data volume; no new runtime code). Compose and Ansible
  examples live in `deploy/` per `docs/prd/deploy-examples.md` and
  `docs/adr/compose-and-ansible.md`.
- Runtime image published to GHCR on `v*.*.*` tags per `docs/prd/container-image.md`
  and `docs/adr/ghcr-on-semver-tag.md`. PR / `main` builds that image and walks the
  container path per `docs/adr/docker-image-ci.md` (no push), including the
  Compose and Ansible example stacks.
