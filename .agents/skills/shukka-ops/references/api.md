# Shukka HTTP API

All request and response bodies are JSON. Errors carry a stable machine-readable code:

```json
{ "error": "forbidden", "message": "API key is not authorized for app \"other\"" }
```

| Code | Status | Meaning |
|------|--------|---------|
| `unauthorized` | 401 | Missing/invalid session or API key |
| `forbidden` | 403 | Key is valid but not allowed for this operation |
| `not_found` | 404 | App, channel, version or key does not exist |
| `conflict` | 409 | Duplicate version, missing artifact, expired upload |
| `invalid_request` | 400 | Malformed payload |
| `storage_error` | 502 | S3 rejected the request |
| `metadata_error` | 422 | Unparseable or contradictory `latest*.yml` or Tauri `latest.json` |
| `rate_limited` | 429 | Login failures exceeded the per-IP window |

## Upload API — `Authorization: Bearer shk_…`

### `POST /api/v1/upload/init`

```json
{
  "app": "my-app",
  "channel": "stable",
  "version": "1.4.2",
  "createChannel": false,
  "files": [
    { "filename": "latest.yml", "size": 412 },
    { "filename": "MyApp-Setup-1.4.2.exe", "size": 78123456 }
  ]
}
```

`app` is optional; when present it must match the key's app. `size` is optional but
checked at finalize when provided. File rules follow the app's `updaterKind`:
Electron requires at least one `.yml`; Tauri requires `latest.json` and/or
artifact + matching `.sig` pairs. `version` and each `filename` must not contain
path separators or `..`. The publish action reads `version` from `latest*.yml`
(Electron) when the input is omitted. For Tauri it uses the input / `SHUKKA_VERSION`,
then `latest.json`, then the nearest `tauri.conf.json`, then a `_1.0.0_` filename
token — `latest.json` is not required.

```json
{
  "uploadId": "…",
  "expiresAt": 1767225600,
  "files": [{ "filename": "latest.yml", "key": "my-app/stable/1.4.2/latest.yml", "uploadUrl": "https://…" }]
}
```

Upload each file with `PUT <uploadUrl>` and the raw bytes as the body. Presigned
URLs expire an hour after `init`.

### `POST /api/v1/upload/finalize`

```json
{ "uploadId": "…", "app": "my-app", "release": false }
```

Verifies every object exists (and matches any declared size), parses each yml, and
requires its `version` to equal the declared version. Default is a **draft** (feed
unchanged). `"release": true` writes `releasedAt` and flips the channel current
version atomically.

```json
{
  "versionId": 12,
  "version": "1.4.2",
  "channel": "stable",
  "artifacts": [{ "filename": "latest.yml", "size": 412, "kind": "metadata" }]
}
```

## App API — session cookie or Bearer key bound to `{appSlug}`

Keys may read and write the bound app (settings, channels, versions, notes, current
version, trends). Keys may **not** delete the app or manage API keys.

| Method & path | Purpose |
|---------------|---------|
| `GET /api/v1/apps/{appSlug}` | Full detail: channels, versions, artifacts, keys, feed URLs |
| `PATCH /api/v1/apps/{appSlug}` | Same payload as create; omit `s3SecretAccessKey` to keep it |
| `DELETE /api/v1/apps/{appSlug}` | Deletes the app — **session only** |
| `GET/POST /api/v1/apps/{appSlug}/channels` | List / create (`{ name }`; name is a URL token) |
| `PATCH /api/v1/apps/{appSlug}/channels/{channel}` | `{ currentVersion }` — version string; `null` clears current; draft is promoted in the same transaction |
| `DELETE /api/v1/apps/{appSlug}/channels/{channel}` | Delete a channel, its version records, and their S3 objects |
| `DELETE /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}` | Delete a version and its S3 objects |
| `GET /api/v1/apps/{appSlug}/channels/{channel}/trend` | Hit trend (`?range=7\|30\|90`) |
| `GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend` | Version trend (empty for drafts) |
| `GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes` | Editor notes |
| `PUT/DELETE …/notes/{locale}` | Upsert / delete a locale note |
| `PUT /api/v1/apps/{appSlug}/notes-config` | Release-log config (no S3 probe) |
| `GET/POST /api/v1/apps/{appSlug}/keys` | List / create keys — **session only** |
| `DELETE /api/v1/apps/{appSlug}/keys/{keyId}` | Revoke, or `?mode=delete` a revoked key — **session only** |

## Admin API — session cookie only

| Method & path | Purpose |
|---------------|---------|
| `GET /api/admin/session` | `{ initialized, authenticated }`; no auth required |
| `POST /api/admin/setup` | `{ password }` — first run only, returns a session cookie |
| `POST /api/admin/login` | `{ password }` — returns a session cookie |
| `POST /api/admin/logout` | Drops the current session |
| `POST /api/admin/password` | `{ currentPassword, newPassword }` — invalidates all sessions |
| `GET /api/admin/apps` | App summaries |
| `POST /api/admin/apps` | Create an app (see payload below) |
| `POST /api/admin/storage/test` | Probe S3 settings without saving |

### App payload

```json
{
  "name": "My App",
  "slug": "my-app",
  "updaterKind": "electron",
  "s3Endpoint": "https://<account>.r2.cloudflarestorage.com",
  "s3Region": "auto",
  "s3Bucket": "releases",
  "s3Prefix": "my-app",
  "s3AccessKeyId": "…",
  "s3SecretAccessKey": "…",
  "s3ForcePathStyle": false
}
```

`updaterKind` is `"electron"` or `"tauri"` (defaults to `"electron"` if omitted).
Kind is chosen at create and is not changed afterwards. `s3Endpoint` is `null` for
AWS S3. Set `s3ForcePathStyle` for MinIO. Objects land at
`{s3Prefix}/{channel}/{version}/{filename}`.

## Public release notes — no auth

`GET /api/v1/apps/{appSlug}/channels/{channel}/notes?from&to&locale` returns published
notes for that channel (`from` inclusive, `to` exclusive). No API key. Only if the app
enabled Release log.

```bash
curl "$SHUKKA_URL/api/v1/apps/my-app/channels/stable/notes?from=1.0.0&locale=en-US"
```

## Update feed — no auth

| Request | Response |
|---------|----------|
| `GET /api/update/{app}/{channel}/{name}.yml` | The current version's metadata, byte-for-byte |
| `GET /api/update/{app}/{channel}` or `.../latest.json` | Tauri updater JSON for the current version |
| `GET /api/update/{app}/{channel}/{artifact}` | `302` to a presigned S3 URL, valid for an hour |

Metadata resolves against the channel's current version. Artifacts resolve by
filename across **released** versions on the channel (`releasedAt` set). Draft
filenames 404 the same as missing files.
