# PRD: 视图角色（View roles）与侧栏底部角色菜单

**Status: shipped.**

## Problem

面板侧栏底部是三行松散的入口：语言切换、设置链接、退出登录，占位大且层级相同。同时，面板的实际使用者不止部署者本人：内容运营只关心各 channel 的发布状态与下载/检查数据，开发者需要集成指引、API key 与新建应用/channel，而删除应用、修改密码等管理动作只有管理员需要。所有入口对所有人可见，既嘈杂也容易误触。

另外，`__root.tsx` 的 pre-paint 内联脚本只跟随系统主题、不读已固定的主题 cookie：手动选择过主题后，首屏会先按系统主题绘制再纠正，产生可见闪烁。

## Users

- **管理员（Admin）**：部署 Shukka 的开发者本人，需要全部入口，包括新建应用、app 设置（编辑/删除）与设置页。
- **开发者（Developer）**：接入发布流水线的工程师，需要 channel 数据、集成指引与 API key，也需要新建应用与新建 channel、编辑应用配置（app Settings 标签）；不需要删除应用与设置页。
- **内容编辑（Content editor）**：只看发布状态与数据（版本表、下载/检查计数），不需要任何配置入口。

## Goals

1. 面板提供三档视图角色：`admin`（管理员）、`developer`（开发者）、`content`（内容编辑），只控制 UI 入口可见性。
2. 角色为 per-browser 设置，存 cookie；新浏览器默认 `admin`。
3. 侧栏底部合并为单一按钮：UserRound 图标 + 当前角色名；点击向上弹出菜单，内含角色切换、语言切换、外观（Light/Dark）切换、设置入口（仅 admin）与退出登录。
4. 主题切换入口从设置页迁入该菜单；设置页保持仅修改密码（Appearance/Account 分区拆分暂缓）。
5. 修复 pre-paint 脚本：cookie 固定的主题在首次绘制前生效；SSR 首屏 `<html>` 即带正确的 `.dark` 类与 `color-scheme`，无闪烁。

## Non-goals

- **不是 RBAC**：角色不做任何鉴权；服务端不存、不校验角色；直接访问 URL 不被拦截（无路由守卫）。
- 多用户/多账户：面板仍是单管理员密码模型。
- 设置页的 Appearance/Account 分区拆分（暂缓，见 `docs/prd/theme-toggle.md` 的修订说明）。
- 角色粒度的更细分配置（自定义角色、按 app 授权等）。

## Flows

### 切换视图角色

1. 点击侧栏底部按钮（图标 + 当前角色名），菜单向上弹出。
2. 「视图角色」分区选择 admin / developer / content，当前角色带选中标记。
3. 面板入口立即按新角色重排；选择写入 cookie，刷新与重开后保持（含 SSR 首屏按钮文案）。

### 各角色可见入口

- **content**：应用列表侧栏 + app 详情的 Channels 标签（版本表含 draft、下载/检查计数）与 Settings 标签（仅 Release log 分区，用于维护发布日志语言配置）。无 Integration / API keys，无 promote，无版本安装包下载，无新建 channel 按钮，无新建应用按钮，无设置入口。
- **developer**：content 所见 + Integration 标签 + API keys 标签 + 新建 channel + 新建应用入口（/apps 头部按钮与空态 CTA）+ promote + 历史行安装包下载 + app Settings 标签（编辑应用配置；删除应用区块仍仅 admin）。无设置入口；不见趋势图、版本统计入口与 release notes 编辑入口（面向内容与运营，工程视角不需要）。
- **admin**：全部，含新建应用按钮、app Settings 标签（编辑 + 删除 app）与设置页入口。

直接输入 URL 访问被隐藏的页面：正常打开，不被拦截。

### 语言与外观切换

1. 角色菜单内「语言」行：EN / 中文 切换，点击不关闭菜单。
2. 角色菜单内「外观」行：Light / Dark 切换，点击不关闭菜单；语义不变——切到与系统相反的主题则记忆，切回一致则恢复跟随。

### 首屏主题

1. 有已固定主题 cookie：SSR 首屏 `<html>` 即带对应类与 `color-scheme`；pre-paint 脚本按 cookie 绘制，不挂系统监听。
2. 无 cookie：SSR 不带类；pre-paint 脚本在首次绘制前按系统偏好确定主题并实时跟随。

## Acceptance criteria

- [x] 侧栏底部为单一按钮（UserRound 图标 + 当前角色名），点击向上弹出菜单；侧栏折叠为图标模式时按钮仍可用（tooltip 显示角色名）。
- [x] 菜单内含：角色三选（当前项带标记）、语言切换、外观切换、设置入口（仅 admin 可见）、退出登录；语言与外观行点击不关闭菜单。
- [x] content 角色：app 详情见 Channels 与 Settings 标签，Settings 内仅 Release log 分区；无新建 channel、新建应用按钮与设置入口。
- [x] developer 角色：另有 Integration 与 API keys 标签、新建 channel、新建应用入口、promote、历史行安装包下载及 app Settings 标签（编辑表单可见，删除应用区块不可见）；无设置入口；Channels 标签内不见趋势图、版本统计按钮与 release notes 编辑按钮。
- [x] content 角色：Channels 可见 draft 行与 notes 编辑，不见 promote 与安装包下载。
- [x] admin 角色：全部入口可见。
- [x] 直接访问被隐藏入口的 URL（如 `/settings`、`/apps/new`）正常打开，无重定向。
- [x] 角色选择写入 cookie；新浏览器（无 cookie）默认 admin；SSR 首屏底部按钮即显示正确角色名，无闪烁。
- [x] 固定主题后刷新/重开浏览器，首屏无错误主题闪烁；SSR HTML 的 `<html>` 类与 `color-scheme` 与 cookie 一致；无 cookie 时仍跟随系统。
- [x] 所有新文案来自类型化字典（en 源语言，zh 编译期键对齐）。
