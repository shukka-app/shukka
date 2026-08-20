---
title: 发布日志（Release notes）
description: 按版本与 locale 维护 release notes，客户端经公开接口按版本段查询。
---

每个版本可以附多条 release note，每条一个 locale（BCP-47），源文为 Markdown。功能按 app 开关，默认关闭。

## 配置

创建应用向导第 3 步，或 app 设置页的「Release log」分区：启用开关、locale 列表、回退 locale（缺省 `en-US`）。配置独立保存，不触碰 S3 配置、不触发存储探测。

## 撰写与编辑

app 启用 release log 后，Channels 标签页的版本历史行提供 notes 编辑入口，跳转到独立的编辑页面 `/apps/{appSlug}/notes/{version}`：

- 所见即所得编辑器，支持从 Word 粘贴与直接粘贴 Markdown 源文。
- 按 locale 切换编辑（已配置 locale 与已有 note 的 locale 的并集），切换不丢草稿。
- draft 与已发布版本都可写；发布后任意时间可再编辑。版本记录本身保持不可变——note 是挂在版本上的可变元数据。
- 保存时服务端渲染出消毒后的 `html` 与纯文本 `text`，与 `markdown` 源文一并落库。
- 清空编辑器不会删除已存 note；删除走显式按钮。

## 公开查询接口

与更新 feed 同一信任模型——**无鉴权**：

```bash
curl -s "$SHUKKA_URL/api/v1/apps/my-app/channels/stable/notes?from=1.2.0&to=1.4.0&locale=zh-CN"
```

- `from` / `to` 为版本字符串，`from` 含、`to` 不含；`from` 为空时返回最新 10 个带 note 的已发布版本。
- 只返回**已发布**版本，按发布时间排序；draft 不出现。
- 响应为 `{ notes: [{ version, releasedAt, locale, markdown, html, text }] }`。`html` 已消毒（源文中的原始 HTML 被剥离），可直接嵌入更新弹窗。
- 每个版本的 note 按 locale 回退链解析到单一 locale：请求 locale 精确匹配 → app 配置的回退 locale → 第一个可用 locale → 该版本省略 note。
- App 未启用 release log 时不返回数据。
