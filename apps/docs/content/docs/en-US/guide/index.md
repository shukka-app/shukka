---
title: Panel overview
description: Setup, sign-in, panel structure, and per-browser preferences for language, theme, and view role.
---

## Setup and sign-in

The first visit to the panel opens the setup page. Set an admin password of at least 8 characters. Every later panel page requires sign-in.

Shukka is a single-admin model: no registration, no multi-user. Password recovery is in [Self-hosting](/en-US/docs/deployment#forgotten-password) (on [Cloudflare Workers](/en-US/docs/cloudflare#password-recovery), run the same SQL against the remote database). The password-hash algorithm is chosen only at first setup — see `SHUKKA_PASSWORD_HASH` on the self-hosting page. The admin password can be changed on the settings page.

## Panel structure

- **App list**: the sidebar lists every app. The header has the new-app entry.
- **App detail**: organized by tabs —
  - **Channels**: channel list and version history (draft markers, download / check counts, trend charts). Promote and notes editing also live here.
  - **Integration**: feed URL, client config snippets, and CI notes for the app's updater (Electron / Tauri).
  - **API keys**: create and revoke API keys.
  - **API docs**: opens the full-page API docs in a new tab (this site also has an [online API reference](/en-US/api)).
  - **Settings**: edit app config (including the Release log section). Delete app is visible only to the admin view role.
- **Settings page**: change the admin password.

## Language, theme, and view role

These three are stored per browser. The entry is the role menu at the bottom of the sidebar (the button that shows the current role name):

- **Language**: English / 中文. The first paint uses the selected language.
- **Appearance**: Light / Dark. Default follows the system. An explicit choice opposite the system is remembered; matching the system goes back to follow.
- **View role**: `admin` / `developer` / `content`. A new browser defaults to `admin`.

View role only controls which entries the panel shows. It is not an access-control layer: opening a URL directly is not blocked.

| Entry | content | developer | admin |
|------|---------|-----------|-------|
| App list, Channels tab (version table, counts) | ✓ | ✓ | ✓ |
| Trend charts, version stats, Release log editing | ✓ | | ✓ |
| Release log section on the Settings tab | ✓ | ✓ | ✓ |
| Integration, API docs, API keys tabs | | ✓ | ✓ |
| New app / channel, promote, edit app config | | ✓ | ✓ |
| Delete app, settings page | | | ✓ |
