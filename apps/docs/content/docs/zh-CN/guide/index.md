---
title: 面板入门
description: 第一次打开面板时如何设置管理员密码并完成登录，以及语言、主题和视图角色这些只存在于当前浏览器里的偏好。
---

## 初始化与登录

首次打开面板会进入 setup 页，设置至少 8 位的管理员密码。之后访问面板任意页面都需要登录。

Shukka 是单管理员模型：没有注册、没有多用户。忘记密码的恢复路径见[自托管部署](/zh-CN/docs/deployment#忘记密码)。管理员密码可以在设置页修改。

## 面板结构

- **应用列表**：侧栏列出所有 app，头部有新建应用入口。
- **应用详情**：按标签组织——
  - **Channels**：channel 列表与版本历史（含 draft 标记、下载 / 检查计数、趋势图），promote 与 notes 编辑入口也在这里。
  - **Integration**：按 app 的更新系统（Electron / Tauri）给出 feed URL、客户端配置片段与 CI 接入说明。
  - **API keys**：创建与吊销 API key。
  - **API docs**：新标签页打开整页 API 文档（本站也有一份[在线 API 参考](/zh-CN/api)）。
  - **Settings**：编辑 app 配置（含 Release log 分区）；删除应用仅 admin 角色可见。
- **设置页**：修改管理员密码。

## 语言、主题与视图角色

这三项按浏览器分别保存。入口统一在侧栏底部的角色菜单（显示当前角色名的按钮）里：

- **语言**：English / 中文，首屏即按所选语言渲染。
- **外观**：Light / Dark。默认跟随系统；显式选择与系统相反时记住选择，与系统一致时恢复跟随。
- **视图角色**：`admin`（管理员）/ `developer`（开发者）/ `content`（内容编辑），新浏览器默认 `admin`。

视图角色只控制面板里能看到哪些入口，不是权限控制：直接访问 URL 不会被拦截。

| 入口 | content | developer | admin |
|------|---------|-----------|-------|
| 应用列表、Channels 标签（版本表、计数） | ✓ | ✓ | ✓ |
| 趋势图、版本统计、Release log 编辑 | ✓ | | ✓ |
| Settings 标签的 Release log 分区 | ✓ | ✓ | ✓ |
| Integration、API docs、API keys 标签 | | ✓ | ✓ |
| 新建应用 / channel、promote、编辑 app 配置 | | ✓ | ✓ |
| 删除应用、设置页 | | | ✓ |
