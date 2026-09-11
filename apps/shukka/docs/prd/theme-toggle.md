# PRD: 明暗主题切换（Light / Dark）

**Status: Superseded for settings Appearance / Account tabs** by `docs/prd/view-roles.md` / `docs/adr/panel-view-roles.md`. Theme toggle lives in the role menu; the settings page remains password + about.

## Problem

面板主题是固定的：暗色样式已完成大半，但没有切换入口，也不跟随系统偏好。管理员在不同环境光下使用面板时无法选择适合的主题。

## Users

- **管理员**（唯一面板用户）：希望面板默认跟随系统明暗偏好，并能在系统偏好不合适时手动固定为亮色或暗色。

## Goals

1. 面板支持 Light 与 Dark 两种主题。
2. 设置页顶部加分段控件，分「Appearance」与「Account」两个分区：主题切换在 Appearance，已有的修改密码归入 Account。
3. 当前分区体现在 URL（`?section=appearance` / `?section=account`），可分享、可随浏览器前进后退导航。
4. 默认跟随系统偏好；系统偏好变化时面板实时跟随。
5. 主动切到与系统相反的主题 → 记住该选择，不再跟随系统；切回与系统一致的主题 → 清除记忆，恢复跟随。
6. 首屏无主题闪烁。

## Non-goals

- 显式的「System」第三选项：跟随系统是默认状态，不是一个可选模式。
- 用户级主题偏好（存数据库）：主题是 per-browser 设置。
- 主题色自定义、高对比度模式等其他外观选项。
- setup / login 页的主题切换入口（这些页按同一套解析结果渲染主题，但不提供切换 UI）。

## Flows

### 管理员：切换主题

1. 打开设置页，顶部分段控件选择「Appearance」。
2. 点击 Light / Dark 切换：
   - 切到与系统偏好相反的主题 → 选择被记住，面板固定为该主题。
   - 切到与系统偏好一致的主题 → 记忆被清除，面板恢复跟随系统。
3. 主题立即全站生效（含 setup / login 页）。

### 管理员：在设置分区之间切换

1. 设置页顶部分段控件在「Appearance」与「Account」之间切换。
2. 当前分区写入 URL 搜索参数；刷新、分享链接、浏览器前进后退都保持/还原对应分区。

### 系统偏好变化

1. 无已存选择时，操作系统切换明暗 → 面板实时跟随。
2. 有已存选择时，系统切换不影响面板主题。

## Acceptance criteria

- [ ] 设置页顶部有分段控件，分「Appearance」与「Account」两区；主题切换在 Appearance，修改密码在 Account。
- [ ] 当前分区体现在 URL（`?section=appearance` / `?section=account`）；直接打开带参数的链接落在对应分区。
- [ ] 首次访问（无已存选择）时面板主题与系统偏好一致；系统偏好变化时实时跟随。
- [ ] 切到与系统相反的主题后，刷新与重开浏览器仍保持该主题；系统偏好变化不再影响面板。
- [ ] 切回与系统一致的主题后恢复跟随系统（已存选择被清除）。
- [ ] 已存选择时 SSR 首屏 HTML 即带正确的 `.dark` 类（或无）；无存选择时主题在首次绘制前按系统偏好确定——两种情况均无可见闪烁。
- [ ] `color-scheme` 与当前主题一致，原生控件（表单、滚动条）随主题渲染。
- [ ] setup / login 页按同一解析结果渲染主题。
