---
title: 发布版本
description: 上传协议、draft 与 promote、回滚、删除语义，以及下载计数与趋势。
---

## 上传协议

发版是一次三段式事务，制品字节不经过 Shukka：

1. `POST /api/v1/upload/init`（Bearer API key）：携带 channel、version 与文件清单（名称 / 大小），返回 pending upload id 与每个文件的 presigned PUT URL。同 channel 已存在同 version（含 draft）时拒绝；目标 channel 不存在时默认拒绝，除非显式传 `createChannel: true`（避免拼写错误静默产生新 channel）。
2. 逐个 PUT 直传 S3。
3. `POST /api/v1/upload/finalize`：Shukka 校验对象齐全（含声明大小）、解析更新元数据、创建版本记录。

文件清单必须满足该 app 更新系统的元数据要求：Electron 至少一个 `.yml`；Tauri 为 `latest.json` 和 / 或成对的制品 + `.sig`。声明了 `version` 的元数据（Electron yml、Tauri `latest.json`）必须与上传版本一致。

finalize 之前，channel 的 feed 始终返回旧版本——半成品上传永远不会到达用户。部分上传失败后不要重试 `init`，重新发起一次新的 `init` 即可，旧的 pending upload 会自行过期。

一般不需要手写这套协议：用 [CI 发布](/docs/ci) 里的 GitHub Action 或上传脚本。

## Draft 与 promote

finalize **默认创建 draft（草稿）版本**：制品与记录齐全，但不改 channel 当前版本，公开 feed、制品 302、公开 notes 查询完全不可见（与不存在相同，返回 404）。

两种上线方式：

- finalize 时带 `release: true`：创建版本并原子切换为当前版本，立即上线。
- 事后 promote：面板 Channels 标签页历史行对 draft 点 promote（admin / developer 角色），或 `PATCH /api/v1/apps/{appSlug}/channels/{channel}` 设 `currentVersion`。draft 首次成为 current 时写入发布时间，此后不可再变回 draft。

版本状态：

| 状态 | 含义 |
|------|------|
| Pending | init 之后、finalize 之前的上传事务；无版本行，feed 不变 |
| Draft | finalize 成功但未发布；历史表可见并带草稿标记，公开面隐身 |
| Released / current | feed 的元数据指向它 |
| Released / 非 current | 公开面仍可按文件名 302 下载（老客户端不受影响），notes 可查询 |

## 回滚

把 channel 的 `currentVersion` 指回任意一个**已发布**版本即可（面板或同一个 PATCH 接口）。切换是原子的：客户端要么看到整套旧版本、要么看到整套新版本。建议回滚而不是删除新版本。

## 删除语义

- 删除 version / channel / app 会同时删除它拥有的 S3 对象，不可撤销。
- 删除的是 current version 时，channel 当前版本回退到剩余最新**已发布**版本；无剩余则清空。
- 版本制品一经 finalize 不可修改，只可删除。

## 下载计数与趋势

每次 yml / 元数据命中与制品 302 都计入所属版本的计数，并按 UTC 小时预聚合。面板 Channels 标签页展示每个版本的下载 / 检查计数与趋势图（admin 与 content 角色可见）：

- channel 趋势：`GET /api/v1/apps/{appSlug}/channels/{channel}/trend?range=7|30|90`，7 天按 UTC 小时聚合，30 / 90 天按 UTC 天聚合。
- 版本趋势：`GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend`，发布后 14 个 UTC 天；draft 返回空序列。
