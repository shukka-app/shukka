---
title: Self-hosting
description: Run Shukka on a single machine with persistent disk using Docker or source, then configure a reverse proxy, object storage, and backups.
---

Shukka is a single-admin self-hosted service. On this path the service database and, by default, the encryption key live on the host disk. Installers live in the S3-compatible storage configured per app.

To run Shukka without a VPS, see [Cloudflare Workers](/en-US/docs/cloudflare).

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

The image is on [GitHub Packages](https://github.com/shukka-app/shukka/pkgs/container/shukka) and can be pulled without logging in. Pushing a semver tag (`vMAJOR.MINOR.PATCH`) builds and publishes via GitHub Actions. Untagged pulls use `latest`. Pin a version with `ghcr.io/shukka-app/shukka:0.1.0`. To build from source, run `docker build -t shukka -f apps/shukka/Dockerfile .` at the repo root and replace the image name above with `shukka`.

The same stack as Compose (Shukka plus an example MinIO) is [`apps/shukka/deploy/compose.yaml`](https://github.com/shukka-app/shukka/blob/main/apps/shukka/deploy/compose.yaml). Pin the image with `SHUKKA_IMAGE`:

```bash
docker compose -f apps/shukka/deploy/compose.yaml up -d
docker exec minio mkdir -p /data/releases
```

Ansible copies that file onto a host and waits for `/api/health`: [`apps/shukka/deploy/ansible/playbook.yml`](https://github.com/shukka-app/shukka/blob/main/apps/shukka/deploy/ansible/playbook.yml). Docker Compose v2 must already be installed.

```bash
ansible-playbook -i inventory.ini apps/shukka/deploy/ansible/playbook.yml
```

The same image can also be deployed with [Kamal](/en-US/docs/kamal): `kamal setup` installs Docker and kamal-proxy, then `kamal deploy` pulls the image and swaps containers.

3. Reverse-proxy to `127.0.0.1:3000` and expose only HTTPS.
4. Open the panel. The first visit enters setup; set an admin password of at least 8 characters. Leave `SHUKKA_PASSWORD_HASH` unset (or `scrypt`) unless you already know this instance must later run on Cloudflare Workers Free — that choice is locked at first setup. See “Password hash” below.
5. Test the storage connection when creating an app. A failed test is not saved.
6. Confirm the service with the “Health / smoke” section below.

## From source + systemd

You need Node 24 (same as CI / `Dockerfile`).

```bash
ni                         # pnpm workspace at the git root
nr --filter shukka build
nr --filter shukka start   # node .output/server/index.mjs , default :3000
```

The process must start in `apps/shukka` (the image uses `WORKDIR /app`), or database migrations will not run on startup. Do not run `nr --filter shukka db:generate` in production.

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

The process only reads these variables. S3 credentials, the admin password, and API keys are **not** startup environment variables. `SHUKKA_PASSWORD_HASH` is read only during **first setup**, before the instance is initialized; afterwards it is ignored.

| Variable | Default | Purpose |
|------|------|------|
| `PORT` or `NITRO_PORT` | `3000` | HTTP port (`NITRO_PORT` wins) |
| `HOST` or `NITRO_HOST` | unset (listen on all addresses) | Bind address |
| `SHUKKA_DATA_DIR` | `./data` (`/data` in the image) | SQLite directory; also where `encryption.key` is created when neither key variable is set |
| `SHUKKA_DB_PATH` | `{data}/shukka.db` | Override the database file path |
| `SHUKKA_ENCRYPTION_KEY_FILEPATH` | unset | Read the S3-secret AES key from this file (64 hex characters, 32 bytes). The process does not generate a key. If the path is outside the data directory, nothing is written under `./data` |
| `SHUKKA_ENCRYPTION_KEY` | unset | The same hex key as a value. The process never writes a key file |
| `SHUKKA_KEY_PATH` | unset | **Deprecated** alias of `SHUKKA_ENCRYPTION_KEY_FILEPATH`, kept for one version. Startup fails if it disagrees with FILEPATH, or if it is set together with `SHUKKA_ENCRYPTION_KEY` |
| `SHUKKA_PASSWORD_HASH` | unset (`scrypt`) | Password KDF for **first setup only**: unset or `scrypt` → `scrypt$…`; `pbkdf2` → `pbkdf2$…`. Locked after init. Other values (including `argon2`) make setup return `invalid_request` |
| `SHUKKA_TRUST_PROXY` | unset | Set `1` or `true` to trust the rightmost `X-Forwarded-For` / `X-Real-IP` hop as the login rate-limit key. Unset: those headers are ignored |
| `SHUKKA_SECURE_COOKIES` | unset | Set `1` or `true` to force `Secure` on the session cookie. HTTPS requests (or `X-Forwarded-Proto: https`) also set `Secure` |
| `SHUKKA_DB_URL` | unset | Remote libsql HTTP URL. **Workers only** — Docker / VPS does not read this |
| `SHUKKA_DB_AUTH_TOKEN` | unset | Optional token for that remote database. **Workers only** |
| `NODE_ENV` | `production` in the image | Node production mode |
| `NITRO_SSL_CERT` + `NITRO_SSL_KEY` | unset | Terminate TLS on the Node process (usually worse than a reverse proxy) |
| `NITRO_UNIX_SOCKET` | unset | Listen on a UNIX socket instead |

`SHUKKA_ENCRYPTION_KEY` and `SHUKKA_ENCRYPTION_KEY_FILEPATH` are mutually exclusive. If neither is set, the first start writes `{SHUKKA_DATA_DIR}/encryption.key`. Empty values or hex that is not 64 characters refuse to start.

On Cloudflare Workers, only `SHUKKA_ENCRYPTION_KEY` is accepted. See [Cloudflare Workers](/en-US/docs/cloudflare).

### Password hash

`SHUKKA_PASSWORD_HASH` is locked at first setup:

- Unset or `scrypt` — default. Use on VPS / Docker / Cloudflare Paid.
- `pbkdf2` — weaker KDF that fits Cloudflare Workers Free CPU. Set this **before** creating the admin password if that is the target.

A stored `scrypt$` hash is never rewritten because you later set `pbkdf2`. To move an existing instance onto a runtime that can only afford pbkdf2, delete `admin` and `sessions` (same path as a forgotten password), set `SHUKKA_PASSWORD_HASH=pbkdf2`, and run setup again.

Hand-editing `admin.password_hash` is unsupported. Stored values start with `scrypt$` or `pbkdf2$`; the process verifies by that prefix. Rewriting the row yourself can lock you out, or put a `scrypt$` instance on Cloudflare Free (login may exceed the CPU budget).

## Reverse proxy and TLS

- The panel, `/api/v1`, and `/api/update` share one port and one process. Forward the whole origin to Shukka. Do not split paths across backends.
- Keep the `Host` header. Use HTTPS externally.
- Behind a reverse proxy, set `SHUKKA_TRUST_PROXY=1` so login rate limiting (10 failures / 15 minutes / IP on Node) uses the client address, not the proxy. Cloudflare Workers does not apply this in-process limit; use the platform WAF.

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

Shukka does **not** ship object storage in the image. If you need self-hosted S3, use the MinIO service in [`apps/shukka/deploy/compose.yaml`](https://github.com/shukka-app/shukka/blob/main/apps/shukka/deploy/compose.yaml), or run MinIO separately, then create an app in the panel (MinIO: set the endpoint, enable path-style; the wizard defaults region to `us-east-1`). GitHub Actions must be able to reach that endpoint from the public internet — uploads go from CI straight to storage, not through Shukka. Shukka still only mounts its own data volume.

## Backup and upgrade

**Default and filepath modes:** the backup boundary is the entire data directory (default `./data` / `/data` in the container): `shukka.db`, WAL (`shukka.db-wal` / `shukka.db-shm`), and `encryption.key` (or the file named by `SHUKKA_ENCRYPTION_KEY_FILEPATH` / `SHUKKA_KEY_PATH`). Copying only the database and dropping the key makes stored S3 secrets unreadable.

**`SHUKKA_ENCRYPTION_KEY` mode:** back up the database directory **and** that secret. The process never writes a key file. Losing the value is the same failure as losing `encryption.key`.

Stop writes, then copy the whole directory, or:

```bash
sqlite3 /data/shukka.db ".backup /tmp/shukka-backup.db"
```

and copy the key file at the same time. Artifacts live in each app's bucket. Manage them with bucket versioning or lifecycle rules; they are not in the data directory.

For a continuously updated off-host copy, or for platforms with an ephemeral container filesystem and no reliable local volume, see [Litestream](/en-US/docs/litestream) — it is built into the image and only takes a few environment variables.

Upgrade: pull a new image or `git pull && ni && nr --filter shukka build`, stop the old process, and start the new process with the same data directory. Migrations run automatically on startup (`boot()`). Do not run two Shukka processes against the same data directory. Rollback: switch back to the old image / old build and keep the data directory.

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

The same steps are how you change the password-hash algorithm (for example `scrypt$` → `pbkdf2$` before moving to Cloudflare Workers Free). Set `SHUKKA_PASSWORD_HASH` **before** the new setup. Do not rewrite `admin.password_hash` by hand.

On Workers, run that SQL against the remote database. See [Cloudflare Workers](/en-US/docs/cloudflare#password-recovery).

## Common failures

| Symptom | Cause and fix |
|------|------------|
| Back at setup after restart | Volume was not mounted, or `SHUKKA_DATA_DIR` / `SHUKKA_DB_PATH` points at an empty directory |
| Can sign in but create / edit app fails with a storage error | Only `.db` was restored; `encryption.key` (or the filepath / `SHUKKA_ENCRYPTION_KEY` value) is missing |
| Process exits immediately mentioning the encryption key | Both `SHUKKA_ENCRYPTION_KEY` and a filepath (`SHUKKA_ENCRYPTION_KEY_FILEPATH` or `SHUKKA_KEY_PATH`) are set; FILEPATH and `SHUKKA_KEY_PATH` disagree; the key is empty / not 64 hex characters; or the filepath does not exist |
| Setup returns `invalid_request` mentioning `SHUKKA_PASSWORD_HASH` | The variable is not `scrypt` or `pbkdf2` |
| Schema is stale after start | Process was not started from the app root, so migrations did not run |
| Creating an app returns `storage_error` | Wrong credentials, bucket, endpoint, or path-style, or the Shukka host cannot reach S3 |
| CI finalize succeeds but clients cannot download | Client cannot reach S3 |
| Sign-in succeeds but the cookie is not set | Panel origin and API origin differ (the proxy split hostnames) |
| Data is gone after upgrade | The new container did not mount the original volume |
