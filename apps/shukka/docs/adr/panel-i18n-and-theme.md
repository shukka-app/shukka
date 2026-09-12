# ADR: 面板 i18n 与主题——类型化字典 + cookie 持久化 + nuqs URL 状态

## Status

Accepted.

Theme *placement* (settings Appearance / Account tabs) was superseded by `docs/adr/panel-view-roles.md`: the toggle lives in the role menu; settings stays password + about. i18n cookie / SSR / typed-dictionary parts of this ADR still stand.

## Context

两个展示层特性一起落地：面板国际化（`docs/prd/panel-i18n.md`）与明暗主题切换（`docs/prd/theme-toggle.md`）。现状：

- 面板没有任何 i18n 基础设施，UI 文案硬编码在组件里。
- 暗色样式已完成约 80%（CSS 变量齐备），`__root.tsx` 有一段 pre-paint 内联脚本，但没有偏好解析与切换入口。
- 两个特性都需要 per-browser 持久化，且都要求首屏即正确（`<html lang>` / `.dark` 类）不闪烁。
- 设置页要同时容纳主题切换与已有的修改密码，需要重组；新建 app 向导的 `?step=` 是手写的搜索参数解析。

## Decision

- **i18n 字符串**：零依赖类型化字典。`src/lib/i18n/en.ts` 是源语言与类型来源；`src/lib/i18n/zh.ts` 用 `satisfies typeof en` 获得编译期键对齐。组件经 React context + `useT()` hook 取文案；日期与相对时间格式化函数同驻 i18n 模块。
- **主题解析**：替换 `__root.tsx` 的 pre-paint 内联脚本为偏好感知版本：cookie 有值用 cookie；无值跟随系统，并挂 media change listener。根元素设置 `color-scheme`，原生控件随主题。
- **持久化**：语言与主题偏好都存 cookie（per-browser）。SSR 读 cookie 渲染 `<html lang>` 与 `.dark`。主题 cookie 的语义是「与系统相反的显式选择」：切回与系统一致的主题即删除 cookie。
- **设置页重组**：设置页顶部用现有 Tabs 组件（default variant）做分段控件，分「Appearance」（主题）与「Account」（改密）；当前分区存于 URL 搜索参数 `?section=appearance|account`。
- **URL 状态**：引入 nuqs 管理搜索参数状态（支持 TanStack Start）；设置页 `?section=` 与新建 app 向导的 `?step=` 都迁移到 nuqs，替换手写解析。

## Alternatives

- **react-i18next / Lingui 等 i18n 框架**：功能全（复数、ICU message format、异步加载），但对单管理员面板 + 两种语言过重；类型化字典在编译期给出键对齐保证，零运行时依赖。
- **localStorage 持久化偏好**：SSR 读不到 localStorage，首屏必闪烁（先按默认渲染再 hydrate 修正），违反两个特性的硬契约。
- **SQLite 设置表**：偏好变服务端状态，需要数据库迁移与设置 API；但偏好是 per-browser 而非 per-user，且未登录的 setup / login 页也要读偏好。
- **继续手写搜索参数解析（不引 nuqs）**：设置页与向导各写一份解析、校验与类型转换，随参数增多重复加剧；nuqs 一处解决且与 TanStack Router 兼容。

## Trade-offs & failure bounds

- Cookie 体积限制对两个小值（语言码、主题名）无压力；但偏好不应扩张到大状态，大状态需另选存储。
- 字典键对齐靠 `satisfies` 在编译期保证：新增文案必须先加 en 键，zh 缺键即类型错误——这是刻意的失败边界。
- 字典无运行时回退链、无复数与 ICU 语法；未来需要复杂消息语法时须重估框架选型。
- nuqs 是第一个纯客户端 URL 状态依赖；升级时需验证与 TanStack Router 的兼容性。
- 两个特性共享同一次设置页重组：任一个落地都带上分段控件与 nuqs 迁移，划分提交时把设置页重组作为公共前置。
- 主题 cookie 的「相反即存、一致即删」语义以系统偏好为隐式默认值；SSR 读不到系统偏好，无 cookie 时首屏主题由 pre-paint 内联脚本在首次绘制前确定——这是 SSR 与系统跟随之间的固有边界。
