# ADR: Version-owned JSON with a separate metadata endpoint

## Decision

Store custom release metadata in one JSON-mode SQLite text column on `versions`, default `{}`. Add it to the existing finalize transaction; pending uploads need no new field. Reuse the version's app/channel identity and cascade lifetime.

Expose GET and PUT at `/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/metadata`. Both return `{ version, metadata }`; PUT accepts `{ metadata }`, replacing the whole value. GET validates explicit Bearer credentials; otherwise a valid session allows drafts and anonymous reads require released state. PUT uses existing app actor authorization.

Use a shared Zod JSON-object contract for HTTP writes and the panel, with a compact UTF-8 byte cap. The zero-dependency upload script performs equivalent input checks before init. Reuse existing Drizzle migrations, typed errors and OpenAPI schema generation.

Keep release metadata out of the dashboard's bulk version response and out of feed generation, cache and hit tracking. Panel Query options live in the existing requests layer; local edits are owned by a Dialog and Textarea. Background fetches must not overwrite a user's draft. Confirm discarding unsaved edits, preserve errors and allow retry.

## Alternatives

- Separate metadata table: introduces joins and a second lifecycle for a mandatory one-to-one object; no independent ownership requires it.
- Inject keys into updater documents: violates Electron byte-preserving feed contract and couples custom fields to three different protocols.
- Standalone editor page or editor package: unnecessary for a 16 KiB JSON object; existing primitives cover the workflow.

## Failure bounds

Whole-object writes use last-successful-write semantics, matching notes; concurrent editors can overwrite one another. Metadata is publicly readable after release and is not a secrets store. A separate client read can fail, so clients own their fallback behavior and must request the updater-selected version. No built-in force semantics or example is delivered.
