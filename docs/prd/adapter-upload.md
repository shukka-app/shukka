# PRD: Adapter-owned upload collection and version inference

**Status: accepted (issue #27).**

## Problem

The GitHub Action / CLI uploader used one Electron-shaped collector: a non-recursive `readdir` of a flat directory, with version read only from `latest*.yml` or `latest.json`.

Tauri’s official `tauri build` writes updater artifacts under `src-tauri/target/release/bundle/<platform>/` (for example `bundle/appimage/*_{version}_amd64.AppImage` + `.sig`) and does **not** write `latest.json`. The Integration Action snippet already tells Tauri users to publish `src-tauri/target/release/bundle`. That directory has only subfolders, so the uploader reported `No files to publish`, then `No … latest.json` even after pointing at `bundle/appimage/`.

The server already accepts a Tauri upload of artifact + matching `.sig` without `latest.json` and generates the feed. The CLI/Action did not match that contract.

## Users

- **CI / Action users**: point `directory` at electron-builder `dist/`, Tauri `bundle/` (or a platform subdir), or a Sparkle output directory and get a publishable file list plus a version without inventing metadata.
- **Standalone CLI users**: same script via `SHUKKA_*` env vars.
- **Server / feed**: unchanged; still validates with the app’s `updaterKind`.

## Goals

1. Each update adapter owns its **uploader-side** rules: which files to collect from a directory, and how to read the version when the user omits `version`.
2. Electron `dist/` behavior stays today’s flat-directory collect (installers, `*.blockmap`, `latest*.yml`); version from yml `version:`; no recursive grab of junk.
3. Tauri collect understands `bundle/` and known platform subdirs; publishes **basenames** (flat S3 / feed names); skips `*.AppDir/`, extract trees, and shared libraries.
4. Tauri publish does **not** require `latest.json` and must **not** synthesize one.
5. Kind is inferred from files, with an optional override; the server still validates against the app’s `updaterKind`.
6. Sparkle collect is a flat directory (`appcast.xml`, archives, matching `.sig`); version from `appcast.xml` then an `App-1.4.2.zip` filename token. See `docs/prd/sparkle-updater.md`.

## Non-goals

- Changing Integration prose for pubkey / HTTP (separate docs issue).
- Changing `release: true` default (separate copy issue).
- Install e2e / changing draft-default feed 404.
- Importing `~/server` or Vite aliases into the Action (must stay zero-dependency).
- Depending on tauri-action / GitHub Releases as a `latest.json` producer.

## Users & stories

- As a Tauri developer, I set Action `directory` to `src-tauri/target/release/bundle` after `tauri build --bundles appimage` and the AppImage + `.sig` publish without `SHUKKA_VERSION` or `latest.json`.
- As an Electron developer, I keep pointing at `dist/` with `latest.yml`; nested junk (`node_modules`, extra trees) is not uploaded.
- As either, I can set `version` / `SHUKKA_VERSION` or `updater-kind` / `SHUKKA_UPDATER_KIND` when inference is wrong or I want an override.

## Flow

1. Read `directory` (`SHUKKA_DIRECTORY` / Action `directory`, default `dist`).
2. Resolve kind: optional `SHUKKA_UPDATER_KIND` / Action `updater-kind`, else infer from files in that directory (`yml` → electron; `appcast.xml` or a Sparkle archive+.sig pair → sparkle; `.sig` / `latest.json` / known bundle layout → tauri; else electron).
3. Dispatch collect to the kind’s collector.
4. If the file list is empty, fail (`No files to publish`).
5. Resolve version: explicit `SHUKKA_VERSION` / Action `version`, else the kind’s inference.
6. `init` → presigned PUT of **basenames** → `finalize` (draft unless `release: true`).

## User-visible failure behavior

- Empty or wrong directory (no collectable updater files): fail, no upload.
- Tauri basename collision (same filename from two platform dirs): fail, naming both paths.
- Tauri version cannot be inferred: fail with a message that names `SHUKKA_VERSION` / Action `version`, `latest.json`, nearest `tauri.conf.json`, and a `_1.0.0_` filename token.
- Electron version cannot be inferred: fail, requiring `latest*.yml` `version:` (or an explicit version).
- Sparkle version cannot be inferred: fail, naming `SHUKKA_VERSION` / Action `version`, `appcast.xml`, and an `App-1.4.2.zip` filename token.
- Server still rejects a file list that does not satisfy the app’s `updaterKind` (Electron needs a `.yml`; Tauri needs `latest.json` and/or artifact + `.sig` pairs; Sparkle needs `appcast.xml` and/or archive + `.sig`).
- Drafts still 404 on the public feed.

## Acceptance criteria

- [ ] `SHUKKA_DIRECTORY=…/bundle` after a real `tauri build --bundles appimage` publishes the AppImage + `.sig` without `SHUKKA_VERSION` or `latest.json` (version from nearest `tauri.conf.json` or a `_1.0.0_` filename token).
- [ ] Electron `dist/` with `latest.yml` still works; the collector does not recurse into nested junk.
- [ ] `*.AppDir` contents are not uploaded.
- [ ] Empty / wrong directories still fail.
- [ ] Server feed still 404s drafts; this feature does not change draft default.
- [ ] Unit tests in `tests/shukka-upload.test.ts` cover nested `bundle/appimage` + `.sig` without `latest.json`, Electron `dist/` unchanged, AppDir skipped, empty/wrong dirs fail.

## Resolved product decisions

- Adapters own uploader-side collect + version; server adapters remain the source of upload/feed *rules*.
- Do not require or synthesize `latest.json`. Official `tauri build` does not write it; the server-generated feed is the product contract. If the user uploads official `latest.json`, existing rewrite/inline-`.sig` behavior stays.
- Tauri version order: explicit `SHUKKA_VERSION` / Action `version` → `latest.json` `version` → nearest `tauri.conf.json` `version` (walk up from the directory) → version token in artifact filename (`_1.0.0_`) → fail naming those options.
- Sparkle version order: explicit `SHUKKA_VERSION` / Action `version` → `appcast.xml` `sparkle:shortVersionString` (else `sparkle:version`) → `App-1.4.2.zip` filename token → fail naming those options.
- Kind detection prefers files; override is optional. Server still validates `updaterKind`. yml wins over `.sig`. `appcast.xml` / a Sparkle archive+.sig pair wins over a lone `.sig` (still Tauri).
- Publish basenames only; fail on collisions.
- Recurse only into the known Tauri bundle layout (`appimage`, `macos`, `nsis`, `msi`, `deb`, `rpm`, `dmg`, `updater`, …). Skip `*.AppDir/`, extract trees, shared libraries.
- Integration Action `directory` may stay `src-tauri/target/release/bundle` once the collector understands it.
