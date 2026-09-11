# PRD: 面板版本安装包下载

## Problem

Channel 历史表能看见每个版本，但运营和开发者没法从面板把各平台安装包下下来：公开 feed 对 draft 是 404，而且走 feed 会把面板点击算进 downloads。`latest.yml` / `.blockmap` / `.sig` 也不是人要的安装包。

## Users

- **管理员 / 开发者（面板）**：从历史行打开弹窗，按平台下载该版本的安装包（含尚未 promote 的 draft）。
- **内容编辑**：不需要这个入口；角色菜单切到 content 时隐藏按钮。
- **CI / API key**：同一条 App API 也能按版本+文件名领取 presigned GET（不经过面板）。

## Goals

1. Channel 历史表每一行（draft / 已发布 / 非 current）提供下载入口；只在历史行，不在当前版本 hero。
2. 弹窗只列安装包，不列 `latest.yml` / `latest-mac.yml` 等 yml、`.blockmap`、`.sig`、`latest.json`。
3. 有哪个平台×架构就渲染哪一块：平台图标 + CPU 架构 + 扩展名（同一格多个包时靠扩展名区分）。
4. 登录态（或绑定该 app 的 API key）按**该版本**的文件名 302 到 S3；draft 可用。
5. 面板 / 这条 API 的下载**不**计入版本 `artifactHits` 与 hit buckets。
6. 过滤完没有任何安装包时，按钮仍在，弹窗显示空状态。

## Non-goals

- 公开的安装包下载站，或改 `/api/update` 让 draft 可匿名下载。
- 当前版本 hero 上的下载入口。
- 在瓷砖上展示文件大小、进度或完整文件名（完整名只作 `title` / `aria-label`）。
- 把 `.pkg`、无 mac 标记的 `.zip`、i686 / ia32 包纳入网格。
- 服务端按「是不是安装包」拒绝 GET：知道文件名即可领取该版本上的任意已存文件。
- 合并或改写现有 `platformsOf` 徽章（那是 feed 覆盖的 OS，不是安装包网格）。

## Scope and user flow

1. admin / developer 在 Channels 历史行点下载图标。
2. 弹窗列出该版本可识别的安装包瓷砖；没有则空状态文案。
3. 点瓷砖：浏览器请求 App API → 302 → 直连 S3。制品字节不经过 Shukka。

## User-visible states

- **有安装包**：网格，一文件一格，顺序 Windows → macOS → Linux，同系统内 x64 → arm → universal。
- **无安装包**：按钮可见，弹窗空状态。
- **content**：无按钮。直接打 API URL 仍按 session/key 鉴权（角色不是鉴权）。

## Failure behavior

- 未登录 / 无效 key → 401；key 绑的是别的 app → 403。
- app / channel / version / 该版本上无此文件名 → 404（draft 与已发布同一套查找）。
- 文件名非法（含路径分隔符等）→ `invalid_request`。

## Installer classification（面板展示规则）

隐藏：`.yml` / `.yaml` / `.blockmap` / `.sig`，以及文件名为 `latest.json`。

显示：`.exe` `.msi` → Windows；`.dmg` `.app.tar.gz` → macOS；`.AppImage` `.deb` `.rpm` → Linux；`.zip` 仅当文件名带 mac / darwin / osx 标记。

架构：`universal` → universal；`arm64` / `aarch64` / `armv7` 等 → arm；无标记 → x64。`i686` / `ia32` 不渲染。认不出系统或扩展名不在允许列表 → 不渲染。

## Acceptance criteria

- [x] 历史行对 admin / developer 有下载按钮；content 没有；hero 没有。
- [x] 弹窗不出现 yml / blockmap / sig / `latest.json`；出现约定扩展名的安装包。
- [x] 瓷砖为平台图标 + 架构 + 扩展名；同一平台同一架构的多个包各占一格。
- [x] draft 与已发布版本都能下载对应文件。
- [x] 该下载不增加 `artifactHits` / artifact hit buckets；同一文件走公开 feed 仍会计数。
- [x] 无安装包时按钮仍在，弹窗为空状态。
- [x] 文案来自类型化字典（en 源语言，zh 键对齐）。

## Resolved product decisions

- 所有已 finalize、有文件的版本都给入口（含 draft）。
- 只做面板入口，不是公开下载面。
- 无架构标记按 x64 展示；能认出 universal 则标 universal。
- 多包时扩展名写在瓷砖下面。
- 登录态 presign，不走公开 feed。
- 面板下载不计 downloads。
- content 隐藏按钮。
- 空列表仍显示按钮。
