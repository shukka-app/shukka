# ADR: `sdk` updater kind（自带更新逻辑的应用）

## Context

公开 release 清单（`GET /api/v1/apps/{appSlug}/channels/{channel}/release`，见
[channel-release-endpoint](./channel-release-endpoint.md)）解决了读取侧：没有 updater 的客户端也能
拿到当前版本与文件列表。但创建应用时没有对应的 kind，导致两件事都不对：

1. 上传时服务端按 `updaterKind` 选 adapter，Electron / Tauri / Sparkle 都要求元数据文件；
   自带更新逻辑的应用传的是任意构建产物，没有 `latest*.yml` / `latest.json` / `appcast.xml`。
2. Integration 面板按 kind 展示协议接入说明，这类应用看到的是 electron-updater / plugin-updater /
   Sparkle 的配置，完全用不上。

kind 是持久化在 `apps.updater_kind` 上的分类，不只是 UI 开关；因此必须是一个真正的 kind。

## Decision

1. `apps.updater_kind` 增加 `sdk`（`electron` | `tauri` | `sparkle` | `sdk`）。列本身是 text /
   varchar，没有 CHECK 约束，已有行不受影响，不需要迁移。kind 仍在创建时选定、之后不改。
2. `src/server/updaters/sdk.ts` 提供最小 adapter，语义是**任意模式**——不按文件名做任何分类：
   - `isMetadataFile` 恒为 `false` —— 所有文件都是 artifact；
   - `hasRequiredMetadata` 恒为 `true` —— 没有元数据要求；空上传由既有的 `initUpload` 拒绝；
   - `parseMetadata` 不解释内容，返回空版本（不可达）；
   - `inferFeedTarget` 恒为 `null`；
   - `platformsOf` 从安装包扩展名推断：`dmg` / `pkg` → macOS，`exe` / `msi` → Windows，
     `AppImage` / `deb` / `rpm` → Linux。
3. feed 行为：不生成任何文档，任何文件名都按 artifact 302 —— 不识别、不拦截任何名字。
   读取版本的正路是公开 release 清单。
4. uploader：`sdk` 无法从目录推断（没有可识别布局），必须在 `updater-kind` / `SHUKKA_UPDATER_KIND`
   显式传入；收集只扫一层扁平目录，收下除点文件以外的全部文件（不复用 Electron 收集器——后者会跳过
   `builder-debug.yml` / `builder-effective-config.yaml` 等 sidecar）；没有元数据可读，`version` 必填，
   省略直接报错。点文件是唯一例外：上传协议本身拒绝 `.` 开头的文件名。
5. Integration 面板对 `sdk` 只展示用法：安装 `@shukka/sdk`、`getChannelRelease` 读取清单、
   文件 URL 302；发布侧三个标签（GitHub Action / HTTP API / Agent）不变，Action 示例带
   `updater-kind: sdk` 与显式 `version`。
6. OpenAPI 的 `updaterKind` enum 增加 `sdk`，属于加法变更；已发布的 SDK 需要重新生成才能认识该值。

## Alternatives

- **复用 `electron` kind，UI 上加一个“只用 release 清单”的开关**：服务端仍按电子协议校验元数据，
  上传直接失败；且 kind 与 UI 判断会分叉。
- **不加 kind，只做公开清单**：创建向导无法表达这类应用，uploader 无法跳过元数据校验。
- **加 `generic` updaterKind 并生成通用 feed 文档**：等于发明第四套更新协议；没有客户端实现，
  却要维护版本比较、平台图与文档。公开清单已经把能力给全。
- **从“目录里没有元数据”推断 sdk**：与 Electron 的宽松打包、以及误传的空目录无法区分，
  推断必然误判；显式传 kind 更可靠。

## Trade-offs & failure bounds

- 建错 kind 仍只能删 app 重建（与既有 kind 一致）。
- `sdk` 没有协议级校验：Shukka 不检查签名、不解析安装包，只确认对象存在、大小一致。
  校验属于使用者应用的责任。
- 平台徽标是文件名启发式；`checksums.txt`、`.zip` 等不会被识别，这不影响 feed 与清单。
- 已有 SDK 版本不认识 `sdk` 这个 enum 值；重新生成后的 SDK 才完整支持（加法变更，不破坏旧代码）。
