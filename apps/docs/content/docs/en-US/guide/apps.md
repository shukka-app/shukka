---
title: Apps and channels
description: Create an app (pick Electron / Tauri, configure S3) and manage channels and feed URLs.
---

## Create an app

The sidebar “New app” entry opens the create wizard:

1. **Updater and name**: pick Electron or Tauri (required), then name and slug. The updater cannot be changed after create.
2. **Storage**: fill in the S3 config (see below). A write test runs before save; failure is not saved.
3. **Release log**: enable switch, locale list, and fallback locale (see [Release log](/en-US/docs/guide/release-notes)).

A new app comes with a `stable` channel.

## S3 configuration

Each app has its own S3 config. The secret is stored encrypted and is not shown after save.

| Vendor | Notes |
|------|------|
| AWS S3 | Leave endpoint empty; use the real region |
| Cloudflare R2 | Endpoint is the R2 S3 API; region `auto` |
| MinIO | Set the endpoint and force path-style |
| Other compatible implementations | Follow their docs; most need path-style |

Network: CI and desktop clients must reach that endpoint. The Shukka host must also be able to read, write, and delete objects. Details are in [Self-hosting](/en-US/docs/deployment#object-storage).

## Channel

A channel is a release track under an app. At any moment it points at most one **published** current version.

- Names may use lowercase letters, digits, hyphens, and underscores, max 63 characters, validated at create time.
- Channels can be added and removed. Deleting a channel also deletes the S3 objects it owns. This cannot be undone.
- Each channel has one public feed. The base URL is `{server}/api/update/{appSlug}/{channel}`, copyable from the Channels / Integration tabs on the app detail page.
