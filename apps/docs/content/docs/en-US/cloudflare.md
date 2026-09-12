---
title: Cloudflare Workers
description: Deploy Shukka on Cloudflare Workers. You need a remote libsql database and an encryption key secret.
---

You can run Shukka on Cloudflare Workers instead of a VPS. Open the Worker URL, set an admin password, then create apps and publish the same way as [self-hosting](/en-US/docs/deployment). There is no data volume: the database is a remote libsql URL, and the encryption key is a Wrangler secret.

## What changes on Workers

| Topic | Node (Docker / VPS) | Cloudflare Workers |
|------|------|------|
| Database | Local SQLite file under `SHUKKA_DATA_DIR` | Remote libsql over HTTP (`SHUKKA_DB_URL`) |
| Schema | Applied on process start when `drizzle/` is in the working directory | Apply `drizzle/` to the remote database **before** deploy. The Worker does not migrate. |
| Encryption key | Default file, or filepath, or value | **Value only**: `SHUKKA_ENCRYPTION_KEY` (64 hex characters). Filepath is rejected. |
| Password hash | Default `scrypt` is fine | Set `SHUKKA_PASSWORD_HASH=pbkdf2` **before first setup** (Cloudflare Free CPU). Locked after init. |
| Login rate limit | 10 failures / 15 minutes per IP | Off. Use the platform WAF / firewall. |
| Feed download / check counts | Written on each feed hit | Not recorded. Use Cloudflare logs / analytics. The feed still returns yml and 302. |

The Worker script on the Free plan must stay under Cloudflare's **3 MiB gzip** limit. Client static assets do not count toward that script limit.

## Prerequisites

1. A [shukka](https://github.com/shukka-app/shukka) checkout (the Worker build lives in that repo).
2. Node 24, same as CI.
3. A remote libsql database (Turso or any compatible HTTP endpoint).
4. Wrangler logged in to the Cloudflare account that will own the Worker.

Apply the SQL files under `drizzle/` to that database **in order**, with the Turso CLI or any client that can run those statements. The Worker does not apply migrations itself. Do not run `nr --filter shukka db:generate` against a production database.

## Secrets

Set these with Wrangler. Do not commit them.

```bash
npx wrangler secret put SHUKKA_ENCRYPTION_KEY
npx wrangler secret put SHUKKA_DB_URL
npx wrangler secret put SHUKKA_DB_AUTH_TOKEN   # if the remote database requires a token
npx wrangler secret put SHUKKA_PASSWORD_HASH   # pbkdf2 — only needed before first setup
```

| Secret | Required | Notes |
|------|------|------|
| `SHUKKA_ENCRYPTION_KEY` | Yes | 64 hex characters (32 bytes). Generate with `openssl rand -hex 32`. Filepath / `SHUKKA_ENCRYPTION_KEY_FILEPATH` / `SHUKKA_KEY_PATH` are not supported on Workers. |
| `SHUKKA_DB_URL` | Yes | Remote libsql HTTP URL. Node self-hosting does not read this variable. |
| `SHUKKA_DB_AUTH_TOKEN` | If the database requires it | Optional token for that URL. |
| `SHUKKA_PASSWORD_HASH` | Before first setup | Must be `pbkdf2` on Cloudflare Free. After setup, changing this variable is a no-op. |

S3 credentials, the admin password, and API keys are **not** process environment variables. You set those in the panel after deploy, same as Docker.

Generate a key and keep a copy. If you lose `SHUKKA_ENCRYPTION_KEY`, stored S3 secrets cannot be decrypted. The Worker never writes `encryption.key`.

## Deploy

From the workspace root:

```bash
ni
nr --filter shukka deploy:worker
```

That runs `build:worker` then `wrangler deploy`. Use `apps/shukka/wrangler.jsonc`. `nr --filter shukka build` is the Docker / VPS build — do not use it here.

Open the Worker URL. First visit is setup (password at least 8 characters). After that, create apps and publish as usual.

Object storage is still configured per app in the panel. The Worker host must be able to reach that S3 endpoint (Head / Get / Delete / probe). CI and desktop clients talk to storage directly, not through the Worker.

## Password recovery

There is no email reset. On the remote database, delete the admin row and sessions, then open setup again:

```sql
DELETE FROM admin;
DELETE FROM sessions;
```

If you are moving an existing `scrypt$` instance onto Cloudflare Free, use this same path and set `SHUKKA_PASSWORD_HASH=pbkdf2` before setup. The panel does not convert hashes.

Hand-editing `admin.password_hash` is unsupported. Stored values start with `scrypt$` or `pbkdf2$`; the process verifies by that prefix. Rewriting the row yourself can lock you out, or leave a `scrypt$` admin on Cloudflare Free (login may exceed the CPU budget).

## Backup

The backup boundary is the **remote database plus** the `SHUKKA_ENCRYPTION_KEY` secret. Losing either makes stored S3 secrets unreadable. Artifacts stay in each app's bucket.

## After deploy

```bash
curl -sS "https://<your-worker>/api/health"
# {"status":"ok","db":"ok"}
```

A failed Worker start is usually a missing `SHUKKA_ENCRYPTION_KEY` or `SHUKKA_DB_URL`, a filepath key, or a remote database that never received `drizzle/`.
