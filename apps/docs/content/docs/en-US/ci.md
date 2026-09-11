---
title: CI publishing
description: Publish build artifacts as a version with the GitHub Action or the zero-dependency upload script.
---

## GitHub Action

`apps/shukka/action.yml` is a JavaScript action: the runner's bundled Node runs `scripts/shukka-upload.mjs` directly and does not call bash. A Windows self-hosted runner only needs the Actions runner (MinGit is fine); Git for Windows is not required.

This path is a **major** break from `uses: shukka-app/shukka@v1`. There is no root `action.yml` stub.

It publishes every artifact in a directory as one version:

```yaml
- uses: shukka-app/shukka/apps/shukka@v2
  with:
    server-url: ${{ secrets.SHUKKA_URL }}
    api-key: ${{ secrets.SHUKKA_API_KEY }}
    app: my-app
    channel: stable
    directory: dist
```

### Inputs

| Input | Required | Default | Description |
|-------|------|------|------|
| `server-url` | ✓ | | Shukka instance base URL, e.g. `https://updates.example.com` |
| `api-key` | ✓ | | API key bound to the target app (`shk_…`) |
| `app` | ✓ | | app slug |
| `channel` | | `stable` | Target channel |
| `directory` | | `dist` | electron-builder output directory (artifacts and `latest*.yml`) |
| `version` | | read from yml in the directory | Version to publish; Tauri artifacts have no yml, so this must be set |
| `create-channel` | | `false` | Whether to create the channel if it does not exist (prevents silently creating a misspelled channel) |
| `release` | | `false` | When `true`, finalize goes live immediately; the default leaves a draft to promote later in the panel or API |

### Outputs

| Output | Description |
|--------|------|
| `version` | Published version |
| `channel` | Channel it was published to |

Hand it the entire output directory: installers, `.blockmap`, every `latest*.yml` (Electron), or the signed bundle + `.sig` (Tauri).

## Manual / other CI: upload script

The same uploader can run outside GitHub Actions — `apps/shukka/scripts/shukka-upload.mjs` is a zero-dependency Node script:

```bash
SHUKKA_SERVER_URL=https://updates.example.com \
SHUKKA_API_KEY=shk_… \
SHUKKA_APP=my-app \
SHUKKA_CHANNEL=stable \
SHUKKA_DIRECTORY=dist \
node apps/shukka/scripts/shukka-upload.mjs
```

| Environment variable | Required | Default | Description |
|----------|------|------|------|
| `SHUKKA_SERVER_URL` | ✓ | | Shukka instance base URL |
| `SHUKKA_API_KEY` | ✓ | | API key bound to the target app |
| `SHUKKA_APP` | ✓ | | app slug |
| `SHUKKA_CHANNEL` | | `stable` | Target channel |
| `SHUKKA_DIRECTORY` | | `dist` | Artifact directory |
| `SHUKKA_VERSION` | | read from yml in the directory | Version; required for Tauri directories |
| `SHUKKA_CREATE_CHANNEL` | | `false` | Set `true` to create a missing channel |
| `SHUKKA_RELEASE` | | `false` | Set `true` to go live immediately, otherwise draft |

## Draft and go-live

Both paths publish as a **draft** by default: the feed does not change and clients cannot see it. After you confirm, promote in the panel, or `PATCH /api/v1/apps/{appSlug}/channels/{channel}` to set `currentVersion`. To go live in one CI step, pass `release: true` / `SHUKKA_RELEASE=true`. Semantics are in [Publishing versions](/en-US/docs/guide/publish).
