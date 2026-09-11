---
title: API keys
description: What an API key can do, its lifecycle, and how to use it.
---

An API key looks like `shk_<random>`, is bound to a single app, and lets CI / agents / scripts operate that app programmatically.

## Capabilities

Most read/write operations you can click in the panel for the bound app, the key can also do:

- Read app detail and change app settings (settings changes trigger an S3 write probe)
- CRUD for channel / version / release note
- Set `currentVersion` (promote draft / rollback)
- Read download counts and trends
- Upload a version (`upload/init` + `upload/finalize`)

A key **cannot**:

- List / create other apps, or delete an entire app
- Issue / revoke / delete API keys (key lifecycle is panel-only)
- Change the admin password or other instance-level operations (`/api/admin/*` is session-only)

Using app A's key against app B returns 403. A revoked or invalid key returns 401.

## Lifecycle

- Create and revoke on the **API keys** tab of the app detail page.
- **The plaintext appears only once, in the create response.** It cannot be retrieved later; the database stores only a hash. If you lose it, revoke and create a new one.
- Revocation takes effect immediately.

## Usage

```bash
curl -s "$SHUKKA_URL/api/v1/apps/my-app" \
  -H "Authorization: Bearer shk_…"
```

Error responses use a `{ error, message }` envelope. `error` is one of: `unauthorized`, `forbidden`, `not_found`, `conflict`, `invalid_request`, `storage_error`, `metadata_error`.

The full callable surface is in the [API Reference](/en-US/api).
