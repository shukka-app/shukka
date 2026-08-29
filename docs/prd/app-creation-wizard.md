# PRD: 新建 app 向导（/apps/new 两步创建）

## Problem

新建 app 目前是一张单页长表单：名称、slug 与一整组 S3 字段（endpoint、region、bucket、prefix、access key/secret、path-style）一次全部摊开。对第一次配置的管理员来说，「我这个厂商该填什么」全靠自己知道——R2 的 region 要填 `auto`、AWS 的 endpoint 要留空、MinIO 要勾 path-style——填错要等整表提交、服务端探测失败后才被发现。

## Users

- **管理员**（唯一面板用户）：创建 app 时希望按自己用的存储厂商只看到该填的字段，不理解的字段被合理默认值接管。

## Goals

1. `/apps/new` 第一步：用与存储相同的图标按钮选择更新系统（Electron / Tauri / Sparkle，必选、不预选），并填名称与 slug；未手改 slug 时由名称自动 slugify（拼音 + GitHub Slugger）。第二步选存储提供商，对应 S3 字段出现在选择器下方。第三步 Release log。
2. Provider 预设把「该填什么」变成默认行为：每个 provider 只展示适用字段，隐藏字段由向导写入正确默认值。
3. 每一步先自验再前进；最终提交的服务端错误映射回责任步骤并标出字段。
4. 服务端契约不变：app 仍由一次 `POST /api/admin/apps` 创建，S3 写探测失败时数据库不留任何记录。
5. Settings 编辑页保持现有单页完整表单，不受本特性影响。

## Non-goals

- 草稿持久化：刷新或离开页面即丢失已填内容。
- 部分创建：不存在「先建 app、后补 S3」的中间态。
- 修改 Settings 编辑页的表单结构或行为。
- 新增 S3 配置字段；provider 是创建向导的展示选择，不持久化到 app 上。

## Flows

### 管理员：两步创建 app

1. 第一步：选更新系统，填 app 名称与 slug。未选手动改过的 slug 随名称自动生成。客户端校验通过（kind 已选、名称必填、slug 格式正确）才能进入第二步。
2. 第二步：选择 provider（AWS / Cloudflare R2 / MinIO / Other），该 provider 的 S3 字段直接出现在选择器下方；填完后提交。
3. 提交即一次 `POST /api/admin/apps`；创建成功跳转到新 app 详情页（默认含 `stable` channel）。

### 切换 provider

第二步中已输入内容后切换 provider：共有字段（bucket、prefix、access key、secret，以及新旧 provider 都显示的 endpoint）保留已输入值；只有隐藏字段的默认值（region / path-style / AWS 的 null endpoint）随 provider 替换。

### 各 provider 字段表

| Provider | 显示字段 | 隐藏字段与写入值 |
|----------|----------|------------------|
| AWS | bucket、region、access key、secret、prefix | endpoint → `null`；path-style → `false` |
| Cloudflare R2 | bucket、endpoint、access key、secret、prefix | region → `auto`；path-style → `false` |
| MinIO | bucket、endpoint、access key、secret、prefix | region → `us-east-1`；path-style → `true` |
| Other | 完整字段集：bucket、region、endpoint、prefix、access key、secret、path-style | 无 |

## Validation & failure behavior

- 每一步在允许前进前自验：第一步校验更新系统已选、名称与 slug；第二步校验当前 provider 下显示字段的必填项。
- 最终提交失败后，服务端错误映射回责任步骤：
  - `conflict`（slug 已被占用）与 name/slug 相关的 `invalid_request` → 回到第一步，标记对应字段。
  - S3 相关的 `invalid_request` 与 `storage_error`（凭证/连通性探测失败）→ 停留在第二步展示错误。
- 未变化的服务端契约：创建只有一次 POST；S3 写探测失败不落库半成品（见 `docs/adr/per-app-s3-and-secrets.md`）。

## Acceptance criteria

- [ ] `/apps/new` 第一步同时选择更新系统（Electron / Tauri / Sparkle，必选、不预选）并填写名称与 slug；校验未通过时无法进入第二步。
- [ ] 第二步选择 provider 后，S3 字段直接出现在 provider 选择器下方，无第三个页面。
- [ ] 四个 provider 的显示字段与隐藏字段默认值与上表一致（AWS：endpoint=`null`、path-style=`false`；R2：region=`auto`、path-style=`false`；MinIO：region=`us-east-1`、path-style=`true`；Other：显示全部字段）。
- [ ] 输入后切换 provider，共有字段（bucket、prefix、access key、secret、双方都显示的 endpoint）保留已输入值。
- [ ] slug 冲突（`conflict`）或 name/slug 的 `invalid_request` 使向导回到第一步并标记对应字段；S3 相关 `invalid_request`/`storage_error` 停留在第二步。
- [ ] 最终提交仍是一次 `POST /api/admin/apps`；探测失败时数据库无新增 app。
- [ ] 创建成功后跳转到新 app 详情页。
- [ ] Settings 编辑页保持现有单页完整表单，行为不变。
