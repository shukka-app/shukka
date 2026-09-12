# ADR: 视图角色——per-browser cookie + 客户端 context 的纯展示过滤；侧栏底部合并为角色菜单

## Status

Accepted.

## Context

见 `docs/prd/view-roles.md`。要点：

- 面板需要按「管理员 / 开发者 / 内容编辑」三档隐藏 UI 入口，但产品明确这不是鉴权：单管理员密码模型不变，服务端不参与。
- 侧栏底部已有语言切换、设置链接、退出登录三行松散入口；主题切换按原 PRD 应落在设置页 Appearance 分区，但设置页分区重组被暂缓，需要一个现在的落点。
- `__root.tsx` 的 pre-paint 内联脚本是 i18n/主题改造前的旧版本：只跟随系统、不读主题 cookie，手动固定主题后首屏必闪烁。`src/lib/theme.ts` 已有 cookie 感知的 `THEME_INLINE_SCRIPT` 与 `getThemePreference` 服务端读取，尚未接线。
- 语言偏好已有完整范式可镜像：cookie 读写（`src/lib/i18n/locale.ts`）+ 服务端读取（`src/lib/i18n/server.ts`）+ 根 loader + provider `initialLocale`，SSR 首屏即正确。

## Decision

- **视图角色是纯前端状态**：`ViewRole = 'admin' | 'developer' | 'content'`，存 per-browser cookie（`shukka_role`），默认 `admin`。服务端只有一个读 cookie 的 server fn（供 SSR 渲染底部按钮文案），不存库、不校验、不出现在任何 API 契约中。
- **镜像 locale 范式**：`src/lib/role.ts` 放纯 cookie 助手（可单测，同 `theme.ts`）；`src/lib/role-context.tsx` 放 context + provider + `useViewRole` / `useSetViewRole`；`src/server/role-fn.ts` 镜像 `theme-fn.ts`。根 loader 返回 `{ locale, theme, role }`，provider 以 `initialRole` 初始化，避免底部按钮文案的水合不一致。
- **可见性过滤在各入口组件内做**：读取 `useViewRole()` 条件渲染入口（标签页、按钮、菜单项）。不加路由守卫，不改任何服务端代码。
- **侧栏底部合并为单一角色菜单**：一个 `SidebarMenuButton`（UserRound + 角色名）触发 `DropdownMenu`（`side="top"`），集中放置角色切换、语言切换（复用 `LanguageSwitcher`）、外观切换（新增 `ThemeSwitcher`，复用 `setThemePreference`）、设置入口（仅 admin）与退出登录。设置页保持仅修改密码，Appearance/Account 分区拆分继续暂缓。
- **主题 pre-paint 修复**：`__root.tsx` 的内联脚本替换为 `THEME_INLINE_SCRIPT`（cookie 感知）；根 loader 同时返回 `getThemePreference()`，SSR 在 `<html>` 上输出 `.dark` 类与 `color-scheme`。无 cookie（跟随系统）时不输出类，由 pre-paint 脚本在首次绘制前解析——不引入主题 provider，保持「cookie + DOM 类」的现状。

## Alternatives

- **服务端角色 / 真 RBAC**：需要用户表、会话与角色绑定、服务端校验全套基础设施；产品明确单管理员模型不变，拒绝。
- **路由守卫（按角色重定向）**：把展示过滤误升级为访问控制，给人安全语义错觉；产品要求直接 URL 访问不被拦截，拒绝。
- **localStorage 存角色**：SSR 读不到，底部按钮文案首屏必闪烁（先渲染 admin 再纠正），且与 locale/theme 的 cookie 范式不一致，拒绝。
- **主题 provider（React context 管理主题）**：主题没有跨组件读取需求（只有切换入口写、pre-paint 脚本与 DOM 类读），SSR 类 + 内联脚本 + `setThemePreference` 已闭合；引入 provider 是过度设计。

## Trade-offs & failure bounds

- 角色只隐藏入口：任何角色都能直接打开被隐藏的 URL，数据接口也不过滤。这是刻意边界——角色改变的是「默认看到什么」，不是「能做什么」。未来若需真鉴权，须重做服务端模型，本决策不向其扩展。
- 可见性判断散落在各入口组件（`useViewRole()` 条件渲染）：新增入口时需主动考虑角色矩阵；矩阵只有三档且集中写在 PRD/spec，接受此成本。
- 角色 cookie 与 locale/theme cookie 同样小；三者都是 per-browser，换浏览器即重置为默认（admin）——对单管理员面板可接受。
- 菜单内的语言/外观行是非 item 行（点击不关闭菜单），牺牲了部分键盘菜单导航语义（箭头键不经过这些行）；行内按钮仍可 Tab 到达，接受。
- `THEME_INLINE_SCRIPT` 以字符串形式内联进 `<head>`，必须与 `theme.ts` 的 cookie 语义保持同步；它已是单一来源（`__root.tsx` 只引用常量），回归由 `tests/theme.test.ts` 与首屏契约兜底。
