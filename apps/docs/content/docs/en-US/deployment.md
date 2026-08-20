---
title: Self-hosting
description: Run Shukka on a single machine with persistent disk using Docker or source, then configure a reverse proxy, object storage, and backups.
---

Shukka is a single-admin self-hosted service. The service database and encryption key live on the host disk. Installers live in the S3-compatible storage configured per app.

## Recommended shape

Run the public image `ghcr.io/shukka-app/shukka` on a VPS (or equivalent single host), mount a persistent volume at `/data`, and put Caddy or nginx in front for HTTPS. Use Cloudflare R2, AWS S3, or a standalone MinIO for object storage.

## Deploy with Docker (primary path)

1. Prepare a Linux host that can run Docker, a domain name, and S3-compatible storage.
2. Pull the public image and run it:

```bash
docker run -d --name shukka --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v shukka-data:/data \
  ghcr.io/shukka-app/shukka
```

The image is on [GitHub Packages](https://github.com/shukka-app/shukka/pkgs/container/shukka) and can be pulled without logging in. Pushing a semver tag (`vMAJOR.MINOR.PATCH`) builds and publishes via GitHub Actions. Untagged pulls use `latest`. Pin a version with `ghcr.io/shukka-app/shukka:0.1.0`. To build from source, run `docker build -t shukka .` at the repo root and replace the image name above with `shukka`.

3. Reverse-proxy to `127.0.0.1:3000` and expose only HTTPS.
4. Open the panel. The first visit enters setup; set an admin password of at least 8 characters.
5. Test the storage connection when creating an app. A failed test is not saved.
6. Confirm the service with the “Health / smoke” section below.

## From source + systemd

You need Node 24 (same as CI / `Dockerfile`) and an environment that can compile native Node modules.

```bash
npm ci
npm run build
npm start          # node .output/server/index.mjs , default :3000
```

The process must start at the repository root, or database migrations will not run on startup. Do not run `npm run db:generate` in production.

Example unit (adjust paths and user for the host):

```ini
[Service]
WorkingDirectory=/opt/shukka
Environment=NODE_ENV=production
Environment=SHUKKA_DATA_DIR=/var/lib/shukka
ExecStart=/usr/bin/node .output/server/index.mjs
Restart=on-failure
```

## Environment variables

The process only reads these variables. S3 credentials, the admin password, and API keys are **not** startup environment variables.

| Variable | Default | Purpose |
|------|------|------|
| `PORT` or `NITRO_PORT` | `3000` | HTTP port (`NITRO_PORT` wins) |
| `HOST` or `NITRO_HOST` | unset (listen on all addresses) | Bind address |
| `SHUKKA_DATA_DIR` | `./data` (`/data` in the image) | SQLite and encryption key directory |
| `SHUKKA_DB_PATH` | `{data}/shukka.db` | Override the database file path |
| `SHUKKA_KEY_PATH` | `{data}/encryption.key` | Override the AES key file for S3 secrets |
| `NODE_ENV` | `production` in the image | Node production mode |
| `NITRO_SSL_CERT` + `NITRO_SSL_KEY` | unset | Terminate TLS on the Node process (usually worse than a reverse proxy) |
| `NITRO_UNIX_SOCKET` | unset | Listen on a UNIX socket instead |

## Reverse proxy and TLS

- The panel, `/api/v1`, and `/api/update` share one port and one process. Forward the whole origin to Shukka. Do not split paths across backends.
- Keep the `Host` header. Use HTTPS externally.
- Known pitfall: when the proxy terminates HTTPS and talks HTTP to the origin, artifact URLs in the Tauri feed may be `http://`. Verify with `curl -sS https://your.host/api/update/{app}/{channel}`. If you see `http://`, have the proxy talk TLS to the backend, or set `NITRO_SSL_CERT` / `NITRO_SSL_KEY` on the process.

## Object storage

Each app is configured independently: endpoint, region, bucket, prefix, access key, secret, force path style. The server runs a write test before create / save and rejects the save on failure.

| Vendor | Notes |
|------|------|
| AWS S3 | Leave endpoint empty; use the real region |
| Cloudflare R2 | Endpoint is the R2 S3 API; region `auto` |
| MinIO | Set the endpoint and force path-style |
| Other compatible implementations | Follow their docs; most need path-style |

CI and desktop clients must be able to reach that endpoint (upload PUT, download follows 302). The Shukka host must also be able to Head/Get/Delete (used on finalize and version delete). Presigned URLs last 1 hour.

### Local MinIO (optional)

Shukka does **not** ship object storage in the image. If you need self-hosted S3, run MinIO separately, then create an app in the panel (MinIO: set the endpoint, enable path-style; the wizard defaults region to `us-east-1`). GitHub Actions must be able to reach that endpoint from the public internet — uploads go from CI straight to storage, not through Shukka. There is no `docker-compose.yml` in the repo. If you want one, put the Shukka container and MinIO in the same compose file yourself. Shukka still only mounts its own data volume.

## Backup and upgrade

**The backup boundary is the entire data directory** (default `./data` / `/data` in the container): `shukka.db`, WAL (`shukka.db-wal` / `shukka.db-shm`), and `encryption.key`. Copying only the database and dropping the key makes stored S3 secrets unreadable.

Stop writes, then copy the whole directory, or:

```bash
sqlite3 /data/shukka.db ".backup /tmp/shukka-backup.db"
```

and copy `encryption.key` at the same time. Artifacts live in each app's bucket. Manage them with bucket versioning or lifecycle rules; they are not in the data directory.

Upgrade: pull a new image or `git pull && npm ci && npm run build`, stop the old process, and start the new process with the same data directory. Migrations run automatically on startup. Do not run two Shukka processes against the same data directory. Rollback: switch back to the old image / old build and keep the data directory.

## Health / smoke

Process health uses the unauthenticated health endpoint:

```bash
curl -sS "$SHUKKA_URL/api/health"
# {"status":"ok","db":"ok"}            healthy
# {"status":"degraded","db":"down"}    process is up but the database is not (HTTP 503)
```

## Forgotten password

There is no email reset. Stop writes, open the SQLite file in the data directory, delete the admin row and sessions, then restart and go through setup again:

```bash
sqlite3 /var/lib/shukka/shukka.db "DELETE FROM admin; DELETE FROM sessions;"
```

On a Docker volume the default path is `/data/shukka.db`. This deletes the password and login state. App / channel / version records remain.

## Common failures

| Symptom | Cause and fix |
|------|------------|
| Back at setup after restart | Volume was not mounted, or `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` points at an empty directory |
| Can sign in but create / edit app fails with a storage error | Only `.db` was restored; `encryption.key` is missing from the same directory |
| Schema is stale after start | Process was not started from the app root, so migrations did not run |
| Creating an app returns `storage_error` | Wrong credentials, bucket, endpoint, or path-style, or the Shukka host cannot reach S3 |
| CI finalize succeeds but clients cannot download | Client cannot reach S3, or the Tauri feed `url` is `http://` (see the TLS section) |
| Sign-in succeeds but the cookie is not set | Panel origin and API origin differ (the proxy split hostnames) |
| Data is gone after upgrade | The new container did not mount the original volume |
