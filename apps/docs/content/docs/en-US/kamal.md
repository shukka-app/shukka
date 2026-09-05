---
title: Kamal
description: Deploy Shukka's public image to your own host with Kamal.
---

This path uses [Kamal](https://kamal-deploy.org) to deploy the public image `ghcr.io/shukka-app/shukka` to a single host, with data on the named volume `shukka-data`. Prerequisites: a Linux host you can SSH into, a domain pointing at it (ports 80 / 443 open), and Kamal 2 on the deploy machine.

## deploy.yml

```yaml
# config/deploy.yml
service: shukka

# Public image: pulled as-is, no build. Pin a tag in production: ghcr.io/shukka-app/shukka:1.1.1
image: ghcr.io/shukka-app/shukka

# Used even without a build: picks the architecture variant to pull (use arm64 for an arm64 host)
builder:
  arch: amd64

servers:
  web:
    hosts:
      - 192.0.2.10           # your host

proxy:
  host: updates.example.com  # domain pointing at this host
  app_port: 3000             # Shukka listens on 3000
  ssl: true
  forward_headers: true      # with ssl, X-Forwarded-* is not forwarded by default; turn it on explicitly
  healthcheck:
    path: /api/health        # default is /up, which Shukka does not serve

volumes:
  - shukka-data:/data        # SQLite and encryption.key both live on this named volume

env:
  clear:
    SHUKKA_TRUST_PROXY: "1"  # with forward_headers, login rate limiting keys on the client IP
```

The public image pulls anonymously, so no `registry` section is needed. The encryption key is generated into `encryption.key` in the volume on first start; to manage it yourself, put `SHUKKA_ENCRYPTION_KEY=<64 hex>` in `.kamal/secrets` and add:

```yaml
env:
  secret:
    - SHUKKA_ENCRYPTION_KEY
```

## Deploy

```bash
kamal setup     # first time
kamal deploy    # every time after
```

An uninitialized instance still answers health as ok, so the deploy will not hang waiting for a password. Afterwards open `https://updates.example.com` and go through setup. Smoke:

```bash
curl -sS https://updates.example.com/api/health
# {"status":"ok","db":"ok"}
```

## Upgrade and rollback

Upgrade: point `image` at a new tag and `kamal deploy`; migrations run on startup. Rollback: pin the previous tag and deploy again. Data lives in the `shukka-data` volume and swapping containers does not touch it; `latest` has nothing to roll back to, so pin versions in production.

## Day-to-day

- Logs: `kamal app logs -f`.
- Backup: the volume lives at `/var/lib/docker/volumes/shukka-data/` on the host; the backup boundary matches "Backup and upgrade" in [Self-hosting](/en-US/docs/deployment).
- Forgotten password: the image has no sqlite3. `kamal app stop` first, rewrite the rows from a throwaway container, then `kamal app start` and go through setup again:

```bash
docker run --rm -v shukka-data:/data alpine \
  sh -c 'apk add --no-cache sqlite && sqlite3 /data/shukka.db "DELETE FROM admin; DELETE FROM sessions;"'
```

## Caveats

- **Single instance.** SQLite is single-writer; listing several hosts under `servers` gives you several independent instances (each with its own volume), not HA.
- **Brief overlap during cutover.** `kamal deploy` boots the new container and stops the old one only after the health check passes, so two processes share one volume for a few seconds; on a single host SQLite coordinates via file locks and a brief overlap is safe, but do not run two processes long-term.
