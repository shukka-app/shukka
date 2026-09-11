# PRD: 面板国际化（English + 简体中文）

**Status: shipped.** Panel language switcher now lives in the role menu (`docs/prd/view-roles.md`); setup / login still use the standalone switcher.

## Problem

面板所有 UI 文案硬编码为英文：setup、login、各管理页、按钮、表单校验提示、错误展示、日期显示。对中文母语的管理员不够友好；文案散落在组件中，没有统一的字符串层，修改文案或新增语言都要逐文件翻找。

## Users

- **管理员**（唯一面板用户）：部署 Shukka 的开发者本人，可选择用 English 或简体中文使用面板。

## Goals

1. 面板支持两种语言：English（源语言与回退语言）与简体中文。
2. 覆盖全部用户可见页面：setup、login、面板各页——不留硬编码英文文案。
3. 语言切换入口：setup / login 页在右上角；面板页在侧边栏左下角。
4. 服务端错误消息按错误码在客户端翻译；无对应翻译时回退到服务端返回的英文 message。
5. 日期与相对时间格式随所选语言（`toLocaleDateString` / `Intl.RelativeTimeFormat`）。
6. `<html lang>` 随所选语言动态设置；SSR 首屏语言即正确，无闪烁。
7. 语言选择 per-browser 持久化，刷新与重开后保持。

## Non-goals

- 更多语言：字典结构为新增语言留了路，但本特性只交付 en + zh。
- 服务端 API 错误消息多语言化：服务端始终返回英文 message + 固定错误码，翻译只发生在客户端。
- 用户级语言偏好（存数据库）：语言是 per-browser 设置。
- 复数规则、ICU 插值、数字/货币/时区等超出日期与相对时间的本地化。
- 更新 feed、上传 API 等机器消费面的任何变化。

## Flows

### 管理员：在 setup / login 页切换语言

1. 打开 setup 或 login 页：有已存语言则以其渲染，否则以 English 渲染。
2. 点击右上角语言切换器，选择 English / 简体中文。
3. 页面立即以新语言重新渲染；选择写入 cookie，后续访问（含 SSR 首屏）保持。

### 管理员：在面板内切换语言

1. 登录后任意面板页，侧边栏左下角有语言切换器。
2. 切换后全部面板文案与日期显示立即更新；cookie 持久化，刷新后保持。

### 错误消息翻译

1. 服务端返回 `{ error, message }`：`error` 为固定错误码，`message` 为英文。
2. 客户端按 `error` 码查当前语言的翻译：命中则展示翻译，未命中展示服务端英文 message。

### 日期与相对时间

1. 面板内所有日期与相对时间（版本发布时间、key 创建时间等）按当前语言格式化。
2. 切换语言后，已渲染的日期与相对时间随之重新格式化。

## Acceptance criteria

- [x] setup、login 与全部面板页面无硬编码英文文案；所有 UI 字符串来自字典。
- [x] English 字典为源语言；简体中文字典与 English 字典键一一对应，缺键在编译期即类型错误。
- [x] setup / login 页右上角有语言切换器；面板页语言切换在侧栏底部角色菜单内。
- [x] 切换语言后当前页面立即以新语言渲染，无需手动刷新。
- [x] 语言选择写入 cookie；刷新与重开浏览器后保持；SSR 首屏 `<html lang>` 与内容语言一致，无闪烁。
- [x] 固定错误码集中的每个码在两种语言下都有翻译；未知错误码回退展示服务端英文 message。
- [x] 日期与相对时间按当前语言渲染（如 English 的 "3 days ago" 与简体中文的 "3 天前"）。
- [x] 服务端 API 响应格式与错误码集不变。
