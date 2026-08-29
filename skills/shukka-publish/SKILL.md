---
name: shukka-publish
description: Publish an Electron app's electron-builder output directory as a release to a self-hosted Shukka update server over its HTTP upload API (init, presigned S3 PUT, finalize). Use when asked to build, upload, publish, ship, or cut a release or version of an Electron app with Shukka, or when wiring electron-updater publishing to a Shukka update feed.
---

# Publish an Electron release with Shukka

Shukka is a self-hosted release manager for electron-updater: a panel plus an upload API, with artifacts stored in S3-compatible storage. This skill publishes an electron-builder output directory as a new version of an app and flips a channel to it.

This skill ships with the Shukka repository and is deliberately generic — it is not tied to one server, app, or channel.

## Gather the facts first

You need four facts before publishing. **Ask the user for any you don't know — do not guess.**

- **Shukka base URL** — e.g. `https://updates.example.com`. The panel's Integration tab shows it.
- **App slug** — the app's unique identifier in Shukka (lowercase, e.g. `acme-notes`).
- **Channel** — e.g. `stable`. The channel must already exist for the app: `init` rejects unknown channels unless the caller passes `createChannel: true`. Prefer asking the user to create the channel in the panel over auto-creating a possibly misspelled one.
- **API key** — `shk_...`, bound to the one app it may upload for. The user creates keys in the Shukka panel (API keys tab); the plaintext is shown once at creation. Never hardcode or commit a key — read it from the environment (e.g. `SHUKKA_API_KEY`) or ask the user to provide it.

## Publish protocol

JSON request bodies; errors come back as `{ "error": <code>, "message": <string> }` where `error` is one of `unauthorized` (bad or revoked key), `forbidden` (key belongs to a different app), `not_found`, `conflict` (that version already exists on the channel), `invalid_request`, `storage_error`, or `metadata_error`.

1. **Init** — `POST {baseUrl}/api/v1/upload/init` with header `Authorization: Bearer shk_...` and body:
   ```json
   { "app": "<appSlug>", "channel": "<channel>", "version": "<version>", "files": [{ "filename": "<name>", "size": <bytes> }] }
   ```
   The file list is the adapter-collected output. Electron: installers, `*.blockmap`, `latest*.yml` in a flat directory (at least one `.yml`). Tauri: updater artifacts with matching `.sig` (and optional `latest.json`) from `bundle/` or a platform subdir; `*.AppDir` is skipped. The response contains `uploadId` and, per file, a presigned `uploadUrl`.
2. **Upload** — `PUT` each file's raw bytes to its `uploadUrl` (direct to S3; URLs expire one hour after init). Send the exact byte count as `content-length`.
3. **Finalize** — `POST {baseUrl}/api/v1/upload/finalize` with the same auth header and body `{ "uploadId": "<id>", "app": "<appSlug>" }`. This creates a **draft** by default (feed unchanged). Pass `"release": true` to write `releasedAt` and flip the channel current version in the same call. A yml whose `version` disagrees with the declared version fails the whole release.

To promote a draft later: `PATCH {baseUrl}/api/v1/apps/{appSlug}/channels/{channel}` with `{ "currentVersion": "<version>" }` and the same API key.

## Steps

1. Build the app with electron-builder; the output directory (usually `dist/`) is what gets published.
2. Read the version unless the user gave one explicitly. Electron: `version:` in `latest*.yml`. Tauri: `latest.json` `"version"`, else the nearest `tauri.conf.json`, else a `_1.0.0_` token in an artifact filename. Do not invent a `latest.json`.
3. Run the publish protocol above against the output directory.
4. If the user asked to go live immediately, pass `release: true` on finalize (or the Action input `release: true`). Otherwise leave it as a draft and say so.
5. Verify a live release with `GET {baseUrl}/api/update/{appSlug}/{channel}/latest.yml` (no auth). A draft is invisible there — that is expected. Report the version, channel, and whether it is draft or live.
