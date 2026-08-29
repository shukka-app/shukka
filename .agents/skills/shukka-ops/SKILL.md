---
name: shukka-ops
description: Operate a Shukka update platform over its HTTP API — create apps and channels, issue and revoke API keys, publish Electron / Tauri / Sparkle releases, inspect versions and download counts, and wire an updater or GitHub Actions to a feed. Use when the user asks to publish a release, set up an update channel, create a Shukka app or API key, debug an update feed, or configure electron-updater, plugin-updater, or Sparkle against Shukka.
---

# Shukka operations

Shukka is a self-hosted release manager for `electron-updater`, Tauri plugin-updater, and Sparkle on S3. It has three
HTTP surfaces with three different authentication models:

| Surface | Path | Auth |
|---------|------|------|
| Admin API | `/api/admin/*` | session cookie from the admin password |
| Upload API | `/api/v1/*` | `Authorization: Bearer shk_…` bound to one app |
| Update feed | `/api/update/{app}/{channel}/*` | none — this is the product contract |

Set `SHUKKA_URL` (e.g. `https://updates.example.com`) before running anything below.

## Publish a release

Prefer the bundled uploader over hand-rolling the protocol. It infers kind from
the directory (yml → electron; `appcast.xml` or a Sparkle archive+.sig → sparkle;
`.sig` / `latest.json` / Tauri bundle layout → tauri) and reads the version from
`latest*.yml` (Electron), for Tauri `SHUKKA_VERSION` then `latest.json` then the
nearest `tauri.conf.json` then a `_1.0.0_` filename token, or for Sparkle
`appcast.xml` then an `App-1.4.2.zip` filename token:

```bash
SHUKKA_SERVER_URL="$SHUKKA_URL" \
SHUKKA_API_KEY="$SHUKKA_API_KEY" \
SHUKKA_APP=my-app \
SHUKKA_CHANNEL=stable \
SHUKKA_DIRECTORY=dist \
node scripts/shukka-upload.mjs
```

In CI, use the action instead:

```yaml
- uses: shukka-app/shukka@v1.0.2
  with:
    server-url: ${{ secrets.SHUKKA_URL }}
    api-key: ${{ secrets.SHUKKA_API_KEY }}
    app: my-app
    channel: stable
    directory: dist
```

Upload the **whole** output directory. Electron: installers, `.blockmap`
files, and every `latest*.yml`. Tauri: point at `src-tauri/target/release/bundle`
(or a platform subdir); the uploader collects artifact + `.sig` pairs and does
not need `latest.json`. Sparkle: `appcast.xml` and/or a zip/dmg plus a
`sign_update` `.sig` sidecar. File rules follow the app's `updaterKind`.

### The raw protocol

Only reach for this when the uploader cannot run (see `references/api.md` for
full request and response shapes).

1. `POST /api/v1/upload/init` — returns `uploadId` and a presigned `uploadUrl` per file.
2. `PUT` each file straight to its `uploadUrl`. Bytes never pass through Shukka.
3. `POST /api/v1/upload/finalize` with the `uploadId`.

Until finalize succeeds the channel keeps serving the previous version, so a
failed upload is never half-published. Do not retry `init` after a partial
upload — start a fresh `init`; the old pending upload expires on its own.

## Release notes (public, no auth)

If the app enabled Release log, clients can read published notes without a key:

```bash
curl "$SHUKKA_URL/api/v1/apps/my-app/channels/stable/notes?from=1.0.0&locale=en-US"
```

## Administer apps, channels and keys

Authenticate once and reuse the cookie:

```bash
COOKIE=$(curl -si "$SHUKKA_URL/api/admin/login" \
  -H 'content-type: application/json' \
  -d '{"password":"'"$SHUKKA_PASSWORD"'"}' \
  | grep -i '^set-cookie:' | cut -d' ' -f2 | cut -d';' -f1)

curl -s "$SHUKKA_URL/api/admin/apps" -H "cookie: $COOKIE"
```

- Creating an app requires working S3 settings — Shukka writes and deletes a
  probe object before saving, so bad credentials fail at creation, not at release.
- A `stable` channel is created with the app. Channel names are URL tokens
  (`^[a-z0-9][a-z0-9_-]{0,62}$`) and must match electron-builder's `channel`
  option exactly.
- An API key's plaintext appears **once**, in the creation response. If it was
  not captured, revoke it and create another.
- Each key is bound to a single app. Using it for another app returns 403.

`references/api.md` lists every admin endpoint with its payload.

## Wire up the client

Each channel has a feed base URL: `{SHUKKA_URL}/api/update/{app}/{channel}`.

```yaml
# electron-builder.yml
publish:
  provider: generic
  url: https://updates.example.com/api/update/my-app/stable
```

No credentials belong in client configuration — the feed is public by design.

## Debug an update that is not offered

Work outward from the feed, in this order:

1. `curl -s "$SHUKKA_URL/api/update/{app}/{channel}/latest.yml"` (Electron),
   `…/latest.json` or the channel root (Tauri), `…/appcast.xml` or the channel
   root (Sparkle). A 404 means the channel has no current published version.
2. Compare the `version` / `sparkle:shortVersionString` in the response against
   the installed app. electron-updater only offers strictly newer versions.
3. `curl -sI "$SHUKKA_URL/api/update/{app}/{channel}/{installer-filename}"` — expect
   a `302`. A 404 means the installer named in the yml was not part of the upload.
4. Check the channel's current version in the panel; a rollback may have repointed it.

## Rollback

Repoint the channel at an older **released** version rather than deleting the new one —
`PATCH /api/v1/apps/{appSlug}/channels/{channel}` with `{"currentVersion": "1.4.2"}`
(session cookie or the app's API key). A draft promoted this way gets `releasedAt`
in the same transaction. The switch is atomic; clients see either the whole old
release or the whole new one.

Deleting a version, channel, or app also deletes the objects it owns from S3 and cannot be undone.
