---
title: Publishing versions
description: Draft and go-live, rollback, delete semantics, plus download counts and trends.
---

Publishing is done with the GitHub Action or upload script in [CI publishing](/en-US/docs/ci). You usually do not write the upload protocol by hand.

## Draft and go-live

Upload creates a draft by default: the record is complete, but it is not offered to users and clients cannot see it.

Two ways to go live:

- Publish at upload time, immediately available to users.
- Later, promote the draft on the Channels tab (admin / developer view roles). The first go-live records the publish time; it cannot become a draft again.

Version states:

| State | Meaning |
|------|------|
| Uploading | Upload is not finished; no version yet |
| Draft | Upload finished but unpublished; visible in the panel, invisible to clients |
| Current | This is the version the channel currently offers to users |
| Published, not current | Still downloadable; older clients are unaffected |

## Rollback

Point the channel back at any published version in the panel. The switch is instantaneous; clients never see a half-new, half-old state. Prefer rollback over deleting the new version.

## Delete semantics

- Deleting a version / channel / app also deletes the S3 objects it owns. This cannot be undone.
- If you delete the current version, the channel falls back to the newest remaining published version, or clears if none remain.
- Version artifacts cannot be modified after upload completes. They can only be deleted.

## Download counts and trends

The Channels tab shows per-version download and check counts and trend charts (visible to admin and content view roles).

On a self-hosted Node process (Docker / VPS), each feed check and artifact 302 increments those counters. On [Cloudflare Workers](/en-US/docs/cloudflare) the feed still returns yml and 302, but Shukka does not record hits — use the platform logs if you need request volume.
