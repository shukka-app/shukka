---
title: Release metadata
description: Attach custom JSON to a version, edit it in the panel, and read it from your client.
---

Each version can carry a custom JSON object. You define its fields and your client interprets them; Shukka stores and serves the object without changing updater feeds.

```json
{
  "build": { "commit": "abc123" },
  "labels": ["desktop", "preview"]
}
```

The top level must be an object. Nested objects, arrays and other JSON values are allowed. The default is `{}`; the limit is **16 KiB of compact JSON encoded as UTF-8**, excluding the API request envelope. Published metadata is public, so keep credentials and secrets out of it.

## Include metadata when uploading

Add `metadata` to your existing [GitHub Action publishing step](/en-US/docs/ci):

```yaml
with:
  # Keep your existing server, app, channel and artifact inputs.
  metadata: '{"build":{"commit":"abc123"},"labels":["desktop","preview"]}'
```

For the standalone uploader, set the equivalent environment variable alongside your existing upload settings:

```sh
SHUKKA_METADATA='{"build":{"commit":"abc123"}}' node scripts/shukka-upload.mjs
```

Invalid JSON, a non-object value or an oversized object fails before upload starts. Direct API callers pass an optional `metadata` object to `POST /api/v1/upload/finalize`. Metadata is saved atomically with the version, including when `release: true` makes it public immediately.

## Edit in the panel

1. Open an app's **Channels** tab in the admin or developer view.
2. Choose **Metadata** on the version row. The dialog loads that version's current JSON.
3. Edit the JSON and select **Save metadata**. Saving replaces the entire object; enter `{}` to clear it.

Draft and published versions are editable, including historical versions. Failed validation or requests keep your input. Closing with unsaved edits asks before discarding them. If two people save the same version, the last successful write wins.

The content view hides this entry; view roles only affect presentation, not authorization. Metadata does not require Release log to be enabled. Editing it does not change artifacts, publication time or the channel's current version.

## Read an exact version

```http
GET /api/v1/apps/my-app/channels/stable/versions/1.4.0/metadata
```

```json
{
  "version": "1.4.0",
  "metadata": {
    "build": { "commit": "abc123" }
  }
}
```

Select the target version with your updater first, then request metadata for that exact app, channel and version. Metadata does not inherit across versions or channels. Your client decides what to do if the separate metadata request fails.

Published versions are publicly readable even after another version becomes current. Anonymous draft reads return `404`; a valid admin session or app-bound API key can read drafts. If you explicitly send an `Authorization` header, an invalid key returns `401` and a key bound to another app returns `403`.

GET responses use `Cache-Control: no-store`. Reading metadata does not count as an update check.

## Replace through the API

Send an authenticated `PUT` to the same URL, using an admin session or the app's API key:

```json
{
  "metadata": {
    "build": { "commit": "def456" }
  }
}
```

The response has the same `{ version, metadata }` shape as GET. PUT replaces the whole object; it does not merge fields. Send `{ "metadata": {} }` to clear it. Invalid writes leave the stored object unchanged.
