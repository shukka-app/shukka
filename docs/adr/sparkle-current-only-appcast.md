# ADR: Sparkle adapter generates a one-item appcast

## Status

Accepted.

## Context

Sparkle clients read an RSS appcast. A hosted catalog can list many `<item>` entries so the client picks the newest compatible build. Shukka’s channel model is one **current** published version: rollback is `PATCH currentVersion`, and drafts must stay invisible. Serving a multi-item history would ignore `currentVersion` and leave a rolled-back newer item on the feed.

Tauri already generates a static document (`generateFeedDocument`) and rewrites artifact URLs onto this feed. Electron still passthroughs yml. Sparkle needs the Tauri pattern: generate XML so enclosure URLs always hit `/api/update/{app}/{channel}/{filename}`.

Sparkle’s version fields differ from Shukka’s single `version` string: `sparkle:version` is often `CFBundleVersion` (build), `sparkle:shortVersionString` is the marketing version.

## Decision

1. `apps.updater_kind` gains `'sparkle'`. Create-time only; Settings cannot change it. Existing rows stay `electron`.
2. Adapter lives at `src/server/updaters/sparkle.ts` and is registered next to Electron / Tauri. Uploader-side collect/version live in `scripts/updaters/sparkle.mjs` (see `docs/adr/adapter-owned-uploader.md`). `inferFeedTarget` returns `macos` for Sparkle archives.
3. **Feed**: `GET /api/update/{app}/{channel}` and `GET .../appcast.xml` call `generateFeedDocument` and return `application/xml; charset=utf-8` with exactly one `<item>`. Extra query parameters (Sparkle’s `os`, `osVersion`, …) are ignored. No current published version → 404.
4. **Enclosure URL** is always `{origin}/api/update/{appSlug}/{channel}/{filename}`. Shukka never serves a CDN URL from an uploaded appcast.
5. **Upload** is valid when the file list includes `appcast.xml`, **or** at least one Sparkle archive (`zip` / `dmg` / `tar.*` / `aar`) plus a matching `*.sig` sidecar from `sign_update`.
6. **Version mapping (finalize)**:
   - Shukka `version` is the upload version string.
   - The **declared** version of an uploaded `appcast.xml` is `sparkle:shortVersionString` when present (element or enclosure attribute), otherwise `sparkle:version`.
   - That declared value must equal the upload version. Neither field may be missing on a one-item appcast (no enclosure / no version → `metadata_error`).
   - `sparkle:version` may differ from `sparkle:shortVersionString` (build vs marketing). The generated item preserves the uploaded `sparkle:version` when it was present; `sparkle:shortVersionString` is the Shukka version (or the uploaded short string, which already matched).
   - `.sig` sidecars do not declare a version.
   - An uploaded appcast must contain **exactly one** `<item>`. Zero or many items → `metadata_error` (Shukka does not pick “newest”).
7. **Generated item without `appcast.xml`**: one enclosure from the first archive that has a `.sig`; `sparkle:version` and `sparkle:shortVersionString` are both the Shukka version; `sparkle:edSignature` is the sidecar text (or the `sparkle:edSignature="…"` value if `sign_update` wrote attributes); `length` is the uploaded object size.
8. **Generated item with `appcast.xml`**: rewrite enclosure URL; keep `sparkle:edSignature` and `length` from the enclosure when present, else fill from a matching `.sig` / HeadObject size.
9. Shukka does not run `generate_keys`, `sign_update`, or `generate_appcast`. CI / operators run those locally.
10. Production Sparkle requires HTTPS (ATS). Same deploy constraint as Tauri.

## Alternatives

- **Multi-item catalog**: client-side fallback for old OS versions. Rejected — breaks `currentVersion` rollback.
- **Passthrough uploaded appcast**: enclosure URLs would point off-feed; rollback could leave extra items. Rejected.
- **Require `sparkle:version` == Shukka version always**: rejects the common CFBundleVersion ≠ marketing version layout. Rejected in favor of shortVersionString-first mapping.
- **Kind on Channel**: same rejection as `docs/adr/updater-kind-on-app.md`.

## Trade-offs and consequences

- Operators who already maintain a historical appcast must upload a one-item file (or omit it and send archive + `.sig`).
- `SURequireSignedFeed` cannot be used: Shukka rewrites the enclosure URL.
- Linux CI cannot run Sparkle.framework; coverage there is XML shape + EdDSA bytes (`docs/adr/sparkle-updater-e2e.md`).
- Wrong-kind uploads fail at init (`hasRequiredMetadata`) the same way Tauri rejects a yml-only directory.
