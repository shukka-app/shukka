# PRD: 发布日志（Release log）——按版本段查询的多语言 release notes

## Problem

electron-updater 支持在更新弹窗中展示 release notes，CLI 与仪表盘类调用方也常需要「某两个版本之间改了什么」。Shukka 目前只存版本记录与计数，没有任何地方承载每个版本的说明文字：内容编辑无处写，调用方无处读，更新弹窗只能显示一个干巴巴的版本号。

## Users

- **内容编辑（面板 content 视图角色）**：为每个版本撰写、修改 release notes；这是 content 角色的核心职责（见 `docs/prd/view-roles.md`）。
- **调用方（匿名）**：Electron 应用（经 electron-updater）、CLI、仪表盘等，通过**公开无鉴权** API 读取 notes——与更新 feed 同一信任模型。
- **管理员 / 开发者**：配置 app 的 release log 开关、locale 列表与回退 locale（配置不属于 content 角色）。

## Goals

1. 每个版本可附多条 release note，每条一个 locale（BCP-47）；源格式为 Markdown，app 级可配置 locale 列表。
2. 公开无鉴权查询接口：`GET /api/v1/apps/{appSlug}/channels/{channel}/notes?from&to&locale`，channel 作用域、按发布时间排序的版本段（「版本段」）语义：
   - `from` / `to` 为版本字符串；`from` 含、`to` 不含（如 `?from=1.2.0&to=1.4.0` 返回该 channel 内 ≥1.2.0 且 <1.4.0 的版本）。
   - `from` 为空时返回最新 10 个带 note 的版本。
3. 每条 note 返回三种表示：`markdown`（源文）、`html`（消毒后）、`text`（纯文本）。
4. Locale 回退链：请求 locale → 精确匹配 → app 配置的回退 locale（默认 `en-US`）→ 第一个可用 locale → 该版本省略 note。
5. Note 在发布后**任意时间可编辑**；版本本身保持不可变（既有不变量不变）。Note 是挂在版本上的可变元数据。
6. 创建应用向导新增第 3 步：release log 设置（启用开关 + locale 列表 + 回退 locale 选择）——这是「CMS」问题的全部范围，不做通用 CMS。
7. 功能按 app 开关（默认关闭）；未启用的 app 不提供 notes 读写入口。
8. 面板：app 设置页增加「Release log」分区（左侧导航驱动，nuqs `section` 参数）；Channels 标签页历史行在 app 已启用 release log 时提供 notes 编辑入口，跳转到**独立的 notes 编辑页面**（`/apps/{appSlug}/notes/{version}`，按 locale 切换编辑）；draft 与已发布版本都可写 notes；公开读取接口只返回已发布版本。notes 编辑对 content 角色可见可编辑，配置仅 admin/developer。
9. 编辑器为所见即所得的 Milkdown（Crepe）：支持从 Word 粘贴（HTML 剪贴板解析）与直接粘贴 Markdown 源文（自动解析为富文本）；编辑器颜色变量映射到面板主题 token，明暗主题跟随。

## Non-goals

- 通用 CMS：页面、文章、媒体库等一概不做；范围仅限 per-version release notes。
- Notes 读取接口的鉴权与限流（与 feed 同模型，公开）。
- 版本本身的可编辑化；note 之外的发版记录不变。
- Notes 的命中统计与阅读分析。
- 历史版本的批量导入。

## Flows

### 内容编辑：撰写 / 修改 note

1. 打开 app 详情 Channels 标签页，历史表某行点 notes 编辑按钮（app 已启用 release log 时出现），跳转到该版本的独立 notes 编辑页面。
2. 页面上按 locale 切换（已配置 locale + 已有 note 的 locale 的并集）：所见即所得编辑，支持从 Word 粘贴（剪贴板 HTML 自动转为文档结构）与直接粘贴 Markdown 源文（自动解析）。编辑后点「保存」upsert，成功右下角 toast 反馈，失败行内提示且草稿保留；切换 locale 不丢草稿；清空编辑器不会删除已存 note——删除走显式按钮。
3. 保存时服务端渲染并消毒出 `html` 与 `text`，与 `markdown` 一并落库；之后任意时间可再次编辑或删除某 locale 的 note。

### 调用方：读取版本段 notes

1. 以 `{server}/api/v1/apps/{appSlug}/{channel}/notes` 为入口，按需带 `from` / `to` / `locale`。
2. 响应按发布时间排序返回版本段内各版本的 note；每个版本的 note 按回退链解析到单一 locale，链穷尽则该版本不带 note。
3. 调用方按自身需要选用 `markdown` / `html` / `text`；`html` 已消毒，可直接嵌入更新弹窗。

### 管理员 / 开发者：配置 release log

1. 创建应用向导第 3 步，或 app 设置页「Release log」分区：启用开关、locale 列表编辑、回退 locale 选择。
2. 配置走独立 endpoint 保存，不触碰 S3 配置，不触发存储探测。

## Acceptance criteria

- [ ] `?from=1.2.0&to=1.4.0` 返回该 channel 内版本 ≥1.2.0 且 <1.4.0 的 notes（from 含、to 不含），按发布时间排序；其他 channel 的版本不混入。
- [ ] `from` 为空时返回最新 10 个带 note 的版本。
- [ ] 每条 note 同时含 `markdown` / `html` / `text` 三种表示；`html` 经消毒（原始 HTML 被剥离），`text` 为纯文本。
- [ ] 回退链顺序为：请求 locale 精确匹配 → app 配置的回退 locale（缺省 `en-US`）→ 第一个可用 locale → 该版本省略 note。
- [ ] Notes 接口无鉴权可访问；错误响应与 feed 同一错误信封（`{ error, message }`）。
- [ ] Note 在版本发布后任意时间可编辑与删除；版本记录本身不变。
- [ ] 删除 version 时其全部 notes 级联清除。
- [ ] 未启用 release log 的 app：notes 读取接口不返回数据，面板不出现 notes 编辑入口。
- [ ] 面板：创建应用向导含第 3 步 release log 设置；app 设置页含「Release log」分区（`?section=` 可达）；notes 编辑在独立页面（`/apps/{appId}/notes/{versionId}`）进行，编辑器为 Milkdown 所见即所得，支持 Word 粘贴与 Markdown 粘贴，编辑器颜色跟随面板明暗主题；content 角色可见并可编辑 notes，亦可见 Settings 标签内的 Release log 配置分区（其余分区隐藏）；所有新文案来自类型化字典（en 源语言，zh 编译期键对齐，新增 `releaseLog` 命名空间与 `wizard.stepReleaseLog` 键）。
