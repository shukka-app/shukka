# ADR: Kind-specific collect/version live in zero-dependency ESM next to the Action

## Status

Accepted.

## Context

`scripts/shukka-upload.mjs` is the GitHub Action `main` (`docs/adr/javascript-github-action.md`). It must stay **zero-dependency**: no `~/server` imports, no Vite aliases, no package that the Action runner would have to install.

Server adapters in `src/server/updaters/` already own upload validation and feed shape. The missing piece is the **uploader** half: walking a build directory and inferring version. Putting that logic in the TanStack app would force the Action to depend on the server bundle.

Issue #27 decided each adapter implements its own uploader-side collect + version, without inventing a second `latest.json` protocol.

## Decision

1. Keep `scripts/shukka-upload.mjs` as the Action/CLI orchestrator (inputs, init → PUT → finalize).
2. Put kind-specific collect and version inference in plain ESM next to the script: `scripts/updaters/electron.mjs` and `scripts/updaters/tauri.mjs`, plus a small `scripts/updaters/shared.mjs` for shared fail/kind helpers.
3. Do **not** import `~/server` or Vite aliases into these modules. Duplicating small helpers (or commenting the server rule they mirror) is acceptable if tests lock the contract.
4. Infer kind from the directory (`yml` → electron; `.sig` / `latest.json` / known bundle layout → tauri). Honor optional `SHUKKA_UPDATER_KIND` / Action `updater-kind`. The server still validates with the app’s `updaterKind`.
5. Electron collector: today’s flat `readdir` (files only; skip dotfiles and electron-builder junk names). Version from yml `version:`.
6. Tauri collector: if the user points at `bundle/` or a known platform subdir, collect updater artifacts that have a matching `.sig`, the `.sig` files, and optional `latest.json`. Recurse **only** into known platform dirs. Skip `*.AppDir/`, extract trees (`*.app`, `*_extracted`), and shared libraries. Publish **basenames**; fail on collisions.
7. Tauri version, in order: explicit input → `latest.json` → nearest `tauri.conf.json` (walk up) → `_x.y.z_` token in an artifact filename → fail naming those options.
8. Never synthesize `latest.json` to please version inference. The server already generates the feed from `.sig` pairs.

## Alternatives

- **Import server adapters into the Action**: would break the zero-dependency JavaScript action (Vite aliases, Drizzle, typed errors).
- **ncc-bundle the server into `dist/`**: rejected earlier for the Action; still a maintenance cost.
- **One recursive collector for both kinds**: would start uploading Electron `node_modules` / junk and Tauri `*.AppDir` extract trees.
- **Require or synthesize `latest.json`**: invents a second protocol; official `tauri build` does not write the file; the server already generates the feed.

## Trade-offs & consequences

- Rules exist in two places (TS server adapter vs ESM uploader). Tests on `tests/shukka-upload.test.ts` and server Tauri tests must keep them aligned: Tauri may omit `latest.json`; filenames stay flat; the server still 404s drafts.
- Kind inference can be wrong if a directory mixes yml and `.sig`. Override exists; yml wins so an Electron `dist/` never accidentally becomes a recursive Tauri walk.
- Walking up for `tauri.conf.json` can pick a parent app’s version if the user pointed at an odd directory; explicit `version` is the escape hatch. If `version` is a path to `package.json` (Tauri 2), resolve it relative to that conf file.
- Basename collisions are a hard fail rather than prefixing platform paths, because S3 keys and feed filenames are `{prefix}/{channel}/{version}/{filename}` with no extra segments.

## Validation

- Unit tests: nested `bundle/appimage` + `.sig` without `latest.json`; Electron `dist/` unchanged; `*.AppDir` not collected; empty/wrong dirs fail; version order (explicit / json / conf / filename / named error).
- `npm run check`. No Tauri install e2e required for this change.
