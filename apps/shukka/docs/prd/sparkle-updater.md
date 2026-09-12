# PRD: Sparkle updater adapter (current-only appcast)

**Status: shipped.** Follow-on to `docs/prd/updater-adapters.md`, which reserved Sparkle as a non-goal.

## Problem

Shukka already serves Electron (`latest*.yml`) and Tauri (`latest.json`). Native macOS apps use [Sparkle](https://sparkle-project.org/) and have no `updaterKind`. Operators should create a Sparkle app the same way they create Electron / Tauri ones: pick the client, publish a directory, paste a feed URL.

## Users

- **Administrator / developer**: create a Sparkle app, copy `SUFeedURL` / `SUPublicEDKey` snippets, publish zip/dmg (or an `appcast.xml` directory) as a draft, promote, roll back.
- **CI**: upload the whole output directory; no protocol input. Version may be omitted when `appcast.xml` is present.
- **Terminal app**: Sparkle reads one current item from the public appcast and downloads the enclosure through Shukka (302 to S3).

## Goals

1. Wizard first step offers Sparkle next to Electron / Tauri (required, no default). Kind is stored on the app and is not editable in Settings.
2. Upload is the existing init → presigned PUT → finalize path. The directory must satisfy the Sparkle adapter. Metadata version must match the upload version.
3. `GET /api/update/{app}/{channel}` and `GET .../appcast.xml` return `application/xml` for the current published version: exactly one `item`. Enclosure `url` points at this feed’s artifact path. `sparkle:edSignature` and `length` come from the upload. No current version → 404. Extra Sparkle query params on the feed URL are ignored.
4. Published zip / dmg / tar.* / aar 302 by filename; drafts 404. `appcast.xml` is metadata, not an installer tile.
5. Integration shows only Sparkle copy (`SUFeedURL`, `SUPublicEDKey`, Action / HTTP publish). App list / channel badges recognize macOS.
6. Action + `skills/shukka-publish` work without a protocol input; `version` can be read from `appcast.xml` when omitted.
7. Wrong-kind uploads fail with a clear metadata / invalid-request error. Electron and Tauri flows stay unchanged.

## Non-goals

- Multi-item / historical appcast (old-OS fallback catalog, client-side `sparkle:channel` tags in one file).
- Server-side `generate_appcast`, delta generation, or storing the Sparkle private key.
- `SURequireSignedFeed` (rewriting enclosure URLs would invalidate a signed feed).
- Changing `updaterKind` after create; mixing protocols on one app.
- Electron-on-Mac via Sparkle (that path already uses `latest-mac.yml`).
- `quitAndInstall` / real app replacement (same bound as Electron / Tauri e2e).

## Flows

### Create

1. Pick Sparkle → name / slug → storage → release log. Kind is persisted.
2. Integration shows Sparkle Info.plist keys, a feed URL pasteable as `SUFeedURL`, Action / HTTP / agent publish.

### Publish / update

- Directory must include `appcast.xml`, **or** one Sparkle archive (zip / dmg / tar.* / aar) plus a matching `sign_update` sidecar (`*.sig`).
- Finalize is a draft unless `release: true`. Public appcast stays 404 until promote / `PATCH currentVersion`.
- After promote, the appcast has exactly one `item` for that version. Rollback repoints `currentVersion`; the next feed read is the older item only. Newer published files remain 302 by filename.

## User-visible states and failure behavior

- No published current version: feed 404 (same as Tauri).
- Draft files: public feed 404; App API still 302s for operators.
- Uploaded `appcast.xml` with zero items, more than one item, no enclosure, or a version that does not match the upload: `metadata_error`.
- Sparkle app without `appcast.xml` or archive+`.sig`: `invalid_request` on init.
- Electron yml-only dump onto a Sparkle app (and the reverse): `invalid_request`.

## Acceptance criteria

- [x] Create a Sparkle app; Integration shows only Sparkle snippets and a feed URL that can be pasted into `SUFeedURL`.
- [x] Publish a directory (Action or HTTP API) as a **draft**; public appcast is still 404.
- [x] Promote (`release: true` or `PATCH currentVersion`); appcast is 200, exactly one `item`, enclosure URL 302s, `sparkle:edSignature` + `length` present.
- [x] Publish a second version and roll back; appcast is the older version only. The newer published files remain 302 by filename.
- [x] Wrong-kind uploads fail with a clear metadata error (no yml-only dump onto a Sparkle app, and vice versa).
- [x] Existing Electron / Tauri create, upload, feed, and e2e stay unchanged.
- [x] Automated coverage: unit/HTTP tests for upload rules, one-item appcast, draft invisibility, rollback, and 302. Linux CI asserts XML + signature bytes. `macos-latest` Action job `sparkle-updater` runs Sparkle.framework `check` + download (no install). See `docs/adr/sparkle-updater-e2e.md`.

## Resolved product decisions

- One Shukka channel = one `SUFeedURL` = one current item. History catalogs are out of scope so rollback via `currentVersion` stays true.
- Shukka does not hold the EdDSA private key and does not proxy artifact bytes.
- Production Sparkle follows ATS (HTTPS), same deploy note as Tauri.
- Uploaded multi-item appcasts are rejected at finalize; Shukka does not silently pick “the newest”.
