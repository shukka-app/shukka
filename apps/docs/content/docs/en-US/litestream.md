---
title: Litestream
description: Litestream replicates SQLite to object storage and restores it on startup, so FaaS and other environments without a persistent disk can deploy Shukka.
---

Litestream continuously replicates the local SQLite database to S3-compatible object storage and restores it from the replica on container startup — so environments without a persistent disk (FaaS, container platforms such as CloudBase CloudRun) can deploy Shukka. The public image bundles Litestream and a config file ([`deploy/litestream/litestream.yml`](https://github.com/shukka-app/shukka/blob/main/deploy/litestream/litestream.yml), [`deploy/litestream/entrypoint.sh`](https://github.com/shukka-app/shukka/blob/main/deploy/litestream/entrypoint.sh)): set `LITESTREAM_BUCKET` to enable it; unset means plain local-disk mode. A VPS with a persistent volume does not need it — mount the volume instead; see [Self-hosting](/en-US/docs/deployment).

## Environment variables

In addition to the variables in [Self-hosting](/en-US/docs/deployment), this path reads:

| Variable | Default | Purpose |
|------|------|------|
| `LITESTREAM_BUCKET` | unset | Replication switch and replica bucket. Unset means plain local-disk mode |
| `LITESTREAM_PATH` | unset | Replica path inside the bucket |
| `LITESTREAM_ENDPOINT` | unset | S3-compatible endpoint for non-AWS services (R2, COS, …); leave empty for AWS S3 |
| `LITESTREAM_REGION` | unset | Bucket region; use `auto` for R2 |
| `LITESTREAM_ACCESS_KEY_ID` / `LITESTREAM_SECRET_ACCESS_KEY` | unset | Replica storage credentials. `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are also honored; the `LITESTREAM_` forms win |
| `SHUKKA_ENCRYPTION_KEY` | unset | **Required** on this path; see below |

Two pitfalls you must know:

- Only the database file (`SHUKKA_DB_PATH`, default `/data/shukka.db`) is replicated — **`encryption.key` is not**. So this path requires `SHUKKA_ENCRYPTION_KEY` (64 hex characters, `openssl rand -hex 32`); otherwise a cold start generates a new key and all stored S3 secrets become unreadable.
- SQLite is single-writer: the instance count must be 1 (on CloudRun, set max instances to 1). Two instances replicating to the same bucket path corrupt each other's replica.

## Deploy

Generic Docker shape (R2 example):

```bash
docker run -d --name shukka --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -e LITESTREAM_BUCKET=shukka-db \
  -e LITESTREAM_PATH=shukka.db \
  -e LITESTREAM_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
  -e LITESTREAM_REGION=auto \
  -e LITESTREAM_ACCESS_KEY_ID=... \
  -e LITESTREAM_SECRET_ACCESS_KEY=... \
  -e SHUKKA_ENCRYPTION_KEY=<64 hex> \
  ghcr.io/shukka-app/shukka
```

On container platforms such as CloudBase CloudRun: pick the image `ghcr.io/shukka-app/shukka`, configure the variables above as platform env vars (credentials via the platform's secret store), set max instances = 1, port 3000, health check `/api/health`.

## Notes

- The built-in config sets `force-path-style: false` for COS (which rejects path-style access); backends that only speak path-style, such as MinIO, cannot use it — mount your own `litestream.yml` at `/etc/litestream.yml`.
- The retention window uses the upstream default (`retention` 24h); mount a custom config to adjust it.
- A cold start restores automatically when the local DB is missing and a replica exists; on the very first boot there is no replica yet, so the service starts with an empty database and subsequent writes start replicating.
