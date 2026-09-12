# ADR: Draft 用可空 `releasedAt` 表示；补 `createdAt`

## Context

Channel 的 `currentVersionId` 只能表达「现在线上是谁」，不能区分从未上线的草稿和曾经上线的旧版本。公开面必须对前者隐身、对后者按文件名仍可下载。

## Decision

- `versions` 增加 `createdAt`（finalize 成功即写入）。
- `releasedAt` 改为可空：`NULL` = draft；非空 = 已发布（时间戳为首次 promote 或 `release: true` 的 finalize）。
- 一旦 `releasedAt` 有值，禁止改回 `NULL`。
- 已有行：`createdAt` 回填自原 `releasedAt`，`releasedAt` 保持（全部视为已发布）。
- 公开 feed 制品查找、公开 notes 列表：`releasedAt IS NOT NULL`。
- current 必须指向 `releasedAt` 非空的版本（promote draft 时先写 `releasedAt` 再切指针，同一事务）。

## Alternatives

- **`status` 列**：与 `releasedAt` / current 三重状态，易漂移。
- **仅靠 current 判断 draft**：旧版本会被误当成草稿并从公开面消失。

## Trade-offs & failure bounds

- 「发布时间」对 draft 不存在；面板草稿行按 `createdAt` 显示上传时间。
- 版本趋势图的「发布后 14 天」对 draft 无起点，仅已发布版本有此窗口。
