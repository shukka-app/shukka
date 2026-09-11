---
title: CI 发布
description: 用 GitHub Action 或零依赖上传脚本把构建产物发布为一个版本；上传后默认是草稿，确认后才对用户开放。
---

## GitHub Action

仓库根的 `action.yml` 是一个 JavaScript action：runner 自带的 Node 直接执行 `scripts/shukka-upload.mjs`，不调用 bash。Windows 自建 runner 只需 Actions runner（可用 MinGit），不必装 Git for Windows。

把目录内的构建产物完整发布为一个版本：

```yaml
- uses: shukka-app/shukka@v1.2.0
  with:
    server-url: ${{ secrets.SHUKKA_URL }}
    api-key: ${{ secrets.SHUKKA_API_KEY }}
    app: my-app
    channel: stable
    directory: dist
```

### Inputs

| Input | 必填 | 默认 | 说明 |
|-------|------|------|------|
| `server-url` | ✓ | | Shukka 实例 base URL，如 `https://updates.example.com` |
| `api-key` | ✓ | | 绑定目标 app 的 API key（`shk_…`） |
| `app` | ✓ | | app slug |
| `channel` | | `stable` | 目标 channel |
| `directory` | | `dist` | electron-builder 输出目录（含制品与 `latest*.yml`） |
| `version` | | 从目录内 yml 读取 | 发布版本号；Tauri 产物没有 yml，必须显式传 |
| `create-channel` | | `false` | channel 不存在时是否创建（防拼写错误静默建 channel） |
| `release` | | `false` | `true` 时 finalize 直接上线；默认留下 draft，事后在面板或 API promote |

### Outputs

| Output | 说明 |
|--------|------|
| `version` | 发布的版本号 |
| `channel` | 发布到的 channel |

把整个输出目录交给它：安装包、`.blockmap`、每一个 `latest*.yml`（Electron），或签名后的 bundle + `.sig`（Tauri）。

## 手动 / 其他 CI：上传脚本

同一个上传器可以脱离 GitHub Actions 运行——`scripts/shukka-upload.mjs` 是零依赖 Node 脚本：

```bash
SHUKKA_SERVER_URL=https://updates.example.com \
SHUKKA_API_KEY=shk_… \
SHUKKA_APP=my-app \
SHUKKA_CHANNEL=stable \
SHUKKA_DIRECTORY=dist \
node scripts/shukka-upload.mjs
```

| 环境变量 | 必填 | 默认 | 说明 |
|----------|------|------|------|
| `SHUKKA_SERVER_URL` | ✓ | | Shukka 实例 base URL |
| `SHUKKA_API_KEY` | ✓ | | 绑定目标 app 的 API key |
| `SHUKKA_APP` | ✓ | | app slug |
| `SHUKKA_CHANNEL` | | `stable` | 目标 channel |
| `SHUKKA_DIRECTORY` | | `dist` | 产物目录 |
| `SHUKKA_VERSION` | | 从目录内 yml 读取 | 版本号；Tauri 目录必须显式传 |
| `SHUKKA_CREATE_CHANNEL` | | `false` | 传 `true` 才创建不存在的 channel |
| `SHUKKA_RELEASE` | | `false` | 传 `true` 立即上线，否则为 draft |

## Draft 与上线

两条路径默认都发布为 **draft**：feed 不变、客户端不可见。确认无误后在面板 promote，或 `PATCH /api/v1/apps/{appSlug}/channels/{channel}` 设 `currentVersion`。需要 CI 一步上线时传 `release: true` / `SHUKKA_RELEASE=true`。语义细节见[发布版本](/zh-CN/docs/guide/publish)。
