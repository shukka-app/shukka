# ADR: 发布日志——`release_notes` 旁表、写时渲染三表示、独立配置 endpoint、自定义 locale combobox

## Status

Accepted.

## Context

见 `docs/prd/release-log.md`。要点：

- Notes 读取面是公开无鉴权的热路径（与 feed 同信任模型），读取成本必须可忽略——与 hit bucket 预聚合同一哲学：让公开读取保持为纯 SELECT。
- `html` 会被嵌入 Electron 应用的更新弹窗：electron-updater release-notes XSS 是有历史记录的攻击面，消毒是硬要求。
- 版本不可变是既有不变量；notes 要可任意编辑，二者必须解耦。
- App 编辑表单的保存路径会对 S3 配置做写探测；release log 配置不含 S3 字段，不应被拖进同一保存路径。
- 面板已有「独立 admin endpoint + TanStack Query queryKey」范式与类型化 i18n 字典（en 源语言、zh 键对齐）。

## Decision

- **存储：`release_notes` 旁表**。列为 `(id, versionId FK→versions ON DELETE CASCADE, locale, markdown, html, text)`，`(versionId, locale)` 唯一。versions 表不动（不可变不变量保持）；apps 表加 3 列：`releaseLogEnabled`（int bool，默认 0）、`releaseLogLocales`（JSON 数组字符串）、`releaseLogFallbackLocale`（默认 `'en-US'`）。
- **写时渲染**：保存 note 时用 unified 管线（remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-stringify）渲染 `html`，用 mdast-util-to-string 生成 `text`，三者与 `markdown` 源文一并落库。`html` / `text` 是写时渲染产物，公开读取不做任何渲染。
- **模块划分**：`src/server/release-notes.ts` 为领域模块（DB I/O + 公开 API 逻辑）；`src/lib/release-log.ts` 放共享类型/常量/纯函数（回退链解析、版本段解析），不 import db/react，客户端可安全 value-import；`src/lib/markdown.ts` 为渲染器封装。
- **Endpoint**：
  - 公开：`GET /api/v1/apps/{appSlug}/channels/{channel}/notes?from&to&locale`（splat 族路由，无鉴权，错误信封与 feed 一致）。
  - 管理：notes 配置与编辑走 `/api/v1/apps/{slug}/...`（见 `docs/adr/app-api-v1.md`），刻意与改存储的 PATCH 分开，永不触发 S3 探测；note 的 PUT 为 upsert。
- **面板**：创建应用向导第 3 步（启用开关 + locale 列表 + 回退 locale 选择）；app 设置页「Release log」分区（左侧导航驱动，nuqs `section` 参数）；Channels 标签页历史行的 notes 编辑按钮（app 启用时出现）跳转到**独立编辑页面** `/apps/{appSlug}/notes/{version}`（按 locale 切换，取已配置 locale 与已有 note locale 的并集）；notes 编辑对 content 角色开放；配置分区对 admin/developer 在 Settings 标签内可见，content 角色的 Settings 标签仅含 Release log 分区。
- **编辑器：Milkdown Crepe 所见即所得**。独立页面内嵌 Crepe 编辑器。用官方 `CrepeBuilder` + `@milkdown/crepe/feature/*` 按需加入 placeholder / toolbar / list-item / link-tooltip / cursor / block-edit / table；不 import latex、image-block、code-mirror（notes 无公式、图片上传、语法高亮编辑；GFM 围栏代码足够）。编辑器实现只在客户端 `useEffect` 里 `import()`，包装文件无顶层 `@milkdown/*`；路由不得 `React.lazy()` 一个顶层 import milkdown 的模块（那仍会进 Worker SSR 图）。Word 粘贴经 ProseMirror 剪贴板 HTML 解析、Markdown 源文粘贴经 `@milkdown/plugin-clipboard` 自动解析，均为 CrepeBuilder 默认插件。不引任何 Crepe 主题文件，只在全局样式里把 `--crepe-color-*` / `--crepe-font-*` 变量映射到面板主题 token（token 自身在 `.dark` 下翻转，编辑器自动跟随）；结构样式仍只引 `theme/common/style.css`。落库的仍是编辑器序列化出的 Markdown，写时渲染管线不变。
- **Locale 选择器**：自定义 combobox（约 140 行，基于 radix Popover），BCP-47 自动补全，用 `Intl.DisplayNames` 显示本地化语言名。
- **i18n**：新增 `releaseLog` 命名空间与 `wizard.stepReleaseLog` 键，en/zh 同步。

## Alternatives

- **读时渲染（render-on-read）**：公开热路径每次请求都要跑 markdown 管线与消毒，CPU 成本与依赖攻击面都落在无鉴权 endpoint 上；写时渲染让读取退化为纯 SELECT，与 hit bucket 预聚合同一取舍，拒绝读时渲染。
- **原生 `<datalist>` locale 选择**：样式不可控、无本地化语言名展示、过滤行为各浏览器不一致；自定义 combobox 约 140 行换来一致体验与 `Intl.DisplayNames` 支持，值得。
- **notes 列内嵌 versions 表**：把可变元数据塞进不可变记录，既模糊「版本一经 finalize 不可修改」的边界，又让多 locale 只能存 JSON 大字段、无法按 `(versionId, locale)` 做唯一约束与级联；旁表拒绝内嵌。
- **配置并入 app PATCH**：app 保存路径固定触发 S3 写探测，开关 release log 这种与存储无关的操作会被一次无关的网络探测阻塞甚至拒绝；独立 `notes-config` endpoint 把两条保存路径的失败域分开。
- **回退链在客户端解析**：每个调用方各自实现回退会漂移出不一致行为；回退链在服务端解析为单一 locale，客户端拿到即最终态。
- **弹窗 + textarea 编辑**：初版实现，撰写场景被压缩在小弹窗里体验差，且纯文本 textarea 对内容编辑角色不友好（无预览、无格式辅助）；独立页面 + 所见即所得编辑器是撰写场景的合理形态，弹窗方案否决。
- **headless Milkdown 自组装插件**：完全可控但要自建工具栏/斜杠菜单/主题，工作量与维护面大；官方 `CrepeBuilder` 已是按 feature 分包的封装，主题纯 CSS 变量可覆盖，选 CrepeBuilder。
- **`new Crepe({ features })` 关 Latex / ImageBlock / CodeMirror**：单体 `@milkdown/crepe` 入口静态拉齐 KaTeX / `@codemirror/language-data`，运行时 flag 不 tree-shake，Worker SSR 仍收进整包编辑器。拒绝。
- **路由级 `React.lazy()` 编辑器模块**：TanStack Start / Vite 仍把 lazy 目标收进 Worker SSR；必须用无顶层 `@milkdown/*` 的包装 + `useEffect` 内 `import()`。
- **引入 Crepe 自带主题文件（crepe.css / frame.css 等）**：自带主题与面板设计系统（暖灰底、单一强调色、无阴影）不一致，且明暗切换要再处理一套样式表启停；只引 `theme/common/style.css` 结构样式、颜色字体变量全部映射到面板 token，编辑器天然跟随主题。

## Trade-offs & failure bounds

- 渲染器（unified 生态）升级**不会回溯更新**已存的 `html` / `text`：已发布 note 的渲染产物保持写入时样貌，重新保存该 note 才用新管线重渲染。这是刻意选择——读取路径无渲染依赖，升级风险只落在编辑路径。
- 消毒会剥离 Markdown 源文中的原始 HTML：想在 note 里嵌 raw HTML 的写法不会生效，这是安全硬要求的直接后果，不做白名单豁免。
- 写时渲染使保存路径变重（一次同步 markdown 管线执行）；note 体量小、保存频率低，相对公开读取的零渲染成本是噪声。
- `release_notes` 行数上界为 versions × locales；随 version 删除级联清除，与 hit bucket / 计数器同生命周期语义，无独立清理任务。
- 回退链末端是「省略该版本的 note」而非报错：调用方需容忍版本段内个别版本无 note，这是已声明的产品行为。
