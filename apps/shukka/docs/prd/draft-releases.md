# PRD: Draft 发版——默认不上线，promote 后才进 feed

## Problem

现行契约是 finalize 成功即原子切换 channel 当前版本。CI 一传完，客户端立刻能拉到新包。内容编辑无法先写 release notes、负责人也无法先看一眼再上线；误传会直接打到用户设备。

现有接入为零，可以改默认行为。

## Users

- **CI（API key）**：上传制品；默认为 draft，或显式 `release: true` 一步上线。
- **管理员 / 开发者**：在面板或 API 上 promote（设 current）；也可回滚到任意已发布版本。
- **内容编辑**：为 draft 或已发布版本写 notes；不能 promote。
- **终端应用（匿名）**：只看见已 promote 过的版本。

## Goals

1. finalize 默认创建 **draft version**：制品与记录齐全，**不**改 `currentVersionId`，公开 feed / 制品 302 / notes 读取完全不可见。
2. finalize 传 `release: true` 时行为与今日相同：创建版本并原子切 current（同时视为已发布）。
3. Promote：把某个 draft（或任意已发布版本）设为 channel current；draft 首次成为 current 时写入 `releasedAt`，此后不可再变回 draft。
4. 面板 Channels 历史行：draft 有明确标记；admin / developer 可点 promote；content 不可。
5. GitHub Action / 上传脚本 / publish skill 增加 `release`（默认 false），与 API 对齐。
6. 空 channel 在没有任何已发布版本时，feed 仍 404。

## Non-goals

- 灰度、分批、定时发布。
- 把已发布版本改回 draft。
- Pending upload 与 draft 合并（init→PUT 仍是未完成事务，不是 Version）。

## Flows

### CI：上传为 draft

1. `POST /api/v1/upload/init`（同现协议）。
2. 直传 S3。
3. `POST /api/v1/upload/finalize`（不带 `release` 或 `release: false`）→ 版本入库，`releasedAt` 为空，current 不变，feed 仍是旧版本（或 404）。

### CI：一步上线

1. 同上，finalize 带 `release: true` → 入库且原子切 current，`releasedAt` 立即写入。

### 人事后发布

1. 面板历史行对 draft 点 promote，或 API key / session `PATCH` channel 的 `currentVersion`。
2. 该版本 `releasedAt` 若为空则写入；channel 指向它；feed 切换。

### 回滚

1. 把 `currentVersion` 指到另一个 **已发布** 版本（`releasedAt` 非空）。Draft 不能当回滚目标除非先 promote。

## User-visible states

- **Pending**：无版本行，feed 不变。
- **Draft**：历史表可见，标记为草稿；公开面隐身。
- **Released / current**：feed 的 `latest.yml` 指向它。
- **Released / 非 current**：公开面仍可按文件名 302（老客户端），notes 可查询。

## Failure behavior

- 同 version 字符串在同一 channel 已存在（无论 draft 还是 released）→ `conflict`。
- 对未发布版本请求公开 feed 文件名 → `not_found`（与不存在相同，不泄露）。
- Promote 一个不存在或不属于该 channel 的 version → `not_found`。

## Acceptance criteria

- [x] finalize 默认不改 current；feed 在 promote 或 `release: true` 之前不变。
- [x] draft 的 yml、制品文件名、公开 notes 均 404 / 不出现。
- [x] `release: true` 一次 finalize 即可被 electron-updater 看到。
- [x] promote 后 `releasedAt` 有值且此后删除 current 指针不会把它变回 draft。
- [x] 面板 content 角色无 promote 入口；admin / developer 有。
- [x] Action / 上传脚本 / skill 文档与 `release` 默认 false 一致。
- [x] Integration 的 Action / HTTP snippet 与 agent prompt 把 live-vs-draft 写清楚：`release: true` 为真实输入，省略则 feed 不可见；事后在面板 promote 或 `PATCH` `currentVersion`。
- [x] 连续发布两个版本后把 `currentVersion` 指回旧已发布版本：feed 与宿主平台 electron-updater 看到旧版本；被切走的已发布制品仍按文件名 302。

## Resolved product decisions

- 现有项目为零，默认 draft 的 breaking change 可接受。
- 立刻上线口子：`release: true`。
- 公开面必须完全隐身，防止未发布包被猜文件名下载。
- 已发布版本保持「按文件名可下载」，避免老客户端中断。
- Integration 文案把 `release: true` 写成真实输入（不是注释掉的可选项），并一行注明省略则为更新源看不见的 draft；不把 API / Action 默认改成 live。
