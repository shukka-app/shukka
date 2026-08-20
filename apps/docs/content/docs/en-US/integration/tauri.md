---
title: Tauri (plugin-updater)
description: Point tauri-plugin-updater endpoints at the Shukka feed and upload the signed bundle plus .sig files.
---

## Integration

Configure the updater plugin in `tauri.conf.json`. `endpoints` should be the channel feed base URL:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "<tauri signer public key>",
      "endpoints": ["https://updates.example.com/api/update/my-app/stable"]
    }
  }
}
```

`pubkey` comes from the Tauri signing key pair:

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/my-app.key
```

Keep the private key (`~/.tauri/my-app.key`) in CI to sign artifacts. Put the public key in the client config. The feed itself has no auth; do not put credentials in the client config.

Production Tauri clients require HTTPS by default. Use an `https://` endpoint.

## Feed behavior

`GET /api/update/{appSlug}/{channel}` (or `.../latest.json`) returns static updater JSON generated for the current **published** version: each platform in `platforms` has a `url` pointing at an artifact on this feed (follow 302 to S3) and a `signature` that is the body of the matching `.sig` file. 404 when there is no current version. Drafts are invisible to the updater.

Absolute `url` values in `latest.json` are generated from the current request origin. If Shukka sits behind a reverse proxy that talks HTTP to the origin, artifact URLs in the feed may become `http://` — see [the TLS section in Self-hosting](/en-US/docs/deployment#reverse-proxy-and-tls).

## Publishing

Upload the entire artifact directory: per-platform bundles (for example `.app.tar.gz`, `.AppImage`, `.exe`) plus the matching `.sig` for each artifact. You may also include the build-generated `latest.json`. Generate `.sig` with the private key:

```bash
npx @tauri-apps/cli signer sign --private-key <private-key> --password <password> <artifact>
```

Upload validation requires `latest.json` and/or paired artifacts + `.sig`. The `version` declared in `latest.json` must match the uploaded version (`.sig` does not declare a version, so that check is skipped).

A Tauri artifact directory has no electron-builder `latest*.yml`, so the version must be passed to the publisher: the GitHub Action `version` input, or the upload script `SHUKKA_VERSION` environment variable. See [CI publishing](/en-US/docs/ci).
