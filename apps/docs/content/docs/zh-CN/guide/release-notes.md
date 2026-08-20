---
title: Release log
description: 按版本与语言维护发布日志，客户端经公开接口按版本段查询。
---

每个版本可附多条发布日志，每条一个 locale，源文为 Markdown。功能按 app 开关，默认关闭。

## 配置

创建应用向导第 3 步，或 app 设置页的「Release log」分区：启用开关、locale 列表、回退 locale（缺省 `en-US`）。

## 撰写与编辑

app 启用 Release log 后，Channels 标签页的版本历史行提供编辑入口，跳转到独立的编辑页面：

- 编辑器为所见即所得，可粘贴 Word 内容或 Markdown 源文。
- 按 locale 切换编辑。
- 草稿与已发布版本均可编辑。
- 保存时生成 HTML 与纯文本版本。
- 删除 note 用编辑器内的删除按钮。

## 公开查询

已发布的发布日志可公开读取，无须鉴权；草稿不出现。接口详见 [API 参考](/zh-CN/api)。
