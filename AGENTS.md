# Workspace

This is a pnpm workspace. The product lives in `apps/shukka`. The public docs site lives in `apps/docs`. Store packages belong in `packages/*` later.

| Path | Owns |
|------|------|
| `apps/shukka` | Panel, API, feed, Docker, Compose/Ansible, uploader, internal PRD/ADR/spec |
| `action.yml` | GitHub Action entry (`main` points at `apps/shukka/scripts/shukka-upload.mjs`) |
| `apps/docs` | Public documentation site (fumadocs) |
| `packages/*` | Future store adapters — empty in this slice |

Local: `ni`, then `nr --filter shukka <script>` or `nr --filter shukka-docs <script>`.
CI: `pnpm install --frozen-lockfile`.

App workflows, commands, and code layout: [`apps/shukka/AGENTS.md`](apps/shukka/AGENTS.md).
