# ADR: 用 Electron library + electron-updater 做 feed e2e

## Context

Shukka 的硬契约是 feed 与 electron-updater generic provider 兼容。现有验证只到 HTTP：`verify-feed.mjs` 拉 yml、跟随 302。这证明不了 updater 自己会请求哪个 `{channel}{platform}.yml`、会不会跟随 302、sha512 是否对得上。

完整打包安装（codesign / NSIS / 替换正在跑的 AppImage）在 CI 里不可靠，也不属于 Shukka 进程的责任。

## Decision

1. **拉起真正的 Electron 进程**（`electron` 作为 library：Node 里拿到二进制路径，spawn 一个无窗口 main）。在进程内 `require('electron-updater')`，打开 updater log，`forceDevUpdateConfig`，写入 `dev-app-update.yml`，`setFeedURL({ provider: 'generic', url })`。不设 electron-builder `channel`，让 updater 请求默认的 `latest*.yml`。
2. **模拟 electron-builder 产物**：同一版本目录含 `latest.yml` + `.exe`、`latest-mac.yml` + `.zip`、`latest-linux.yml` + `.AppImage`，sha512 为真实哈希。一次 finalize 上传整目录。
3. **断言到 download + checksum**：`checkForUpdates` 看到新版本，`downloadUpdate` 成功（updater 跟随 302 并校验 sha512）。`autoInstallOnAppQuit = false`（electron-updater 6.8 上让 Mac 跳过 Squirrel.Mac）、`disableDifferentialDownload = true`，不调用 `quitAndInstall`。
4. **Linux 上设 `APPIMAGE`**：AppImageUpdater 即使 full download 也要求该环境变量；指向一个占位文件即可。
5. **宿主平台只消费对应 yml**。CI 是 Ubuntu → `latest-linux.yml`；本机 macOS → `latest-mac.yml`。三份元数据仍全部上传，证明多平台产物能落在同一 version。
6. **依赖隔离**：`electron` / `electron-updater` 装在 `tests/e2e/`，不进根 `npm ci`，避免拖慢 `npm run check`。
7. **electron-builder `publish.channel` 与 Shukka channel 不是同一个名字**：feed URL 已经是 `/api/update/{app}/{shukkaChannel}`；updater 默认再请求 `latest*.yml`。集成片段不再把 Shukka channel 写进 builder/updater 的 `channel` 字段。
8. **回退另走 `tests/e2e/run-rollback.mjs`**：连续 `release: true` 两版，`PATCH` channel `currentVersion` 指回旧已发布版本，再断言 feed yml、electron-updater check+download、以及被切走版本按文件名仍 302。客户端 `package.json` 版本保持 `1.0.0`，两版都取 `> 1.0.0` 的唯一 semver，否则 updater 不会 offer 回退后的旧 current。时间戳 patch 必须是无前导零的数字（`2.0.023294` 会被 electron-updater 判为非法 semver）。不测已装更新版本的客户端主动降级——那是 electron-updater 的「只升不降」，不是 Shukka 的回退契约。

## Alternatives

- **继续只 curl feed**：抓不到 updater 的文件名、302、sha512 行为。
- **打成已安装应用再更新**：mac 要签名，win 要 NSIS，linux 要真 AppImage 替换；成本高、不稳定，验证的是 electron-updater / OS，不是 Shukka。
- **根目录 devDependency 装 Electron**：每个 `npm ci` 多下一份二进制。

## Trade-offs & failure bounds

- 不覆盖 `quitAndInstall` / 真机替换。那一步失败不表示 feed 坏了。
- unpackaged Electron 必须 `forceDevUpdateConfig`，否则 updater 直接 idle。
- Linux 未设 `APPIMAGE` 时 download 会抛 `ERR_UPDATER_OLD_FILE_NOT_FOUND`，与 feed 无关。
- updater 主版本升级若改 yml 文件名或下载器，e2e 会红——这是要的。
