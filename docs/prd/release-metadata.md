# PRD: Release metadata

## Problem and outcome

Developers need custom JSON attached to a release that their clients can interpret. Shukka stores and serves it without defining business keys or changing updater protocols. Tracked in shukka-app/shukka#75; Eric approved the design and explicitly excluded a forced-update example and interaction.

## Flow

1. Action input `metadata` or standalone `SHUKKA_METADATA` accepts JSON, validated before upload. Finalize accepts an optional metadata object and saves it atomically with the version, including immediate publication.
2. Admin and developer views show a Metadata action on each version row, independent of release log. It opens a JSON textarea dialog, fetched on demand. Content view hides the entry (presentation only).
3. Save replaces the entire object. Draft and released versions are editable; `{}` clears it. Validation/request failures retain input. Closing dirty edits asks before discarding. The last successful write wins.
4. Clients read metadata for an exact app/channel/version. Published versions are public, including non-current releases; anonymous draft reads return 404. Authenticated management reads can access drafts.

## Contracts and constraints

- Top-level JSON object, nested JSON values permitted, default `{}`. Limit: 16 KiB of UTF-8 encoded compact JSON, excluding the request envelope.
- Explicit Authorization is validated: invalid key 401, wrong-app key 403. Without Authorization, a valid admin session may read drafts; otherwise only released versions are visible.
- Reads use `Cache-Control: no-store`, do not require release log, and do not increment update-check statistics.
- Edits change neither artifacts, release timestamps nor channel pointers. Metadata does not inherit across versions/channels. An updater consumer selects its target version before reading.
- Existing feed bytes and updater behavior remain unchanged. No custom editor dependency, separate configuration platform, concurrent-write conflict detection, or forced-update sample/UI.

## Acceptance

- Default and nested metadata survive finalize, reads, replacement and clear; invalid/oversize writes preserve old data.
- Immediate publish exposes metadata atomically; draft visibility, app-key boundaries and rollback version identity are verified.
- Action/standalone inputs reach finalize and invalid input fails before network upload.
- Real panel flow verifies load/edit/save/reopen, validation, dirty-close confirmation and role visibility.
- Existing updater checks remain green; no metadata bulk payload in version lists.
