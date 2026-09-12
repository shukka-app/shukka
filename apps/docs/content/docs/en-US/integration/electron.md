---
title: Electron (electron-updater)
description: Point electron-updater at Shukka's generic feed and upload the entire electron-builder output directory.
---

## Integration

Each channel's feed base URL is `{server}/api/update/{appSlug}/{channel}`. Put it in the generic provider in `electron-builder.yml`:

```yaml
# electron-builder.yml
publish:
  provider: generic
  url: https://updates.example.com/api/update/my-app/stable
```

The **Integration** tab on the app detail page gives a snippet with the real URL filled in. Client config needs **no credentials** — a public feed is intentional.

## Feed behavior

- electron-updater requests `latest.yml` / `latest-mac.yml` / `latest-linux.yml` by default. Shukka returns the matching yml from the current **published** version byte-for-byte.
- Requests for an artifact filename 302 to a short-lived S3 URL. The client downloads from S3 directly.
- A draft filename is treated the same as missing and returns 404.
- Putting the Shukka channel name in electron-builder `publish.channel` makes the client request `{channel}.yml` instead (for example `stable.yml`). Do not set this unless those files actually exist in the artifacts.

## Publishing

Upload the **entire** electron-builder output directory: installers, `.blockmap` files, and every `latest*.yml`. Shukka serves the yml as uploaded. A missing platform yml means that platform silently never sees updates. The version defaults to the `version` field in the yml files in the directory.

Publish with the [GitHub Action or upload script](/en-US/docs/ci). Do not write the upload protocol by hand.

## Troubleshooting “client does not receive updates”

Work from the feed to the client:

1. `curl -s "$SHUKKA_URL/api/update/{app}/{channel}/latest.yml"` — 404 means the channel has no current version (still a draft?) or that platform's yml was never uploaded. macOS reads `latest-mac.yml`, Linux reads `latest-linux.yml`.
2. Compare the `version` in the response with the installed version — electron-updater only prompts for a strictly newer version.
3. `curl -sI "$SHUKKA_URL/api/update/{app}/{channel}/{installer filename}"` — expect 302. 404 means the installer named in the yml is not in this upload.
4. Check the channel's current version in the panel — someone may have rolled the pointer back.
