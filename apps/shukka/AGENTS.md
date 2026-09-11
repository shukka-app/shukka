# Project workflows

## Feature development

For every new feature, use `$feature-dev` before implementation. Inspect the code and all project documentation, complete the one-question-at-a-time product and technical 质问, and record the agreed product requirements, architecture decisions, and general specification under `apps/shukka/docs/` before changing feature code.

This package is `apps/shukka` in the pnpm workspace. From the git root: `ni`, then `nr --filter shukka <script>`. From this directory: `nr <script>`.

Documentation layout:

| Path | Role |
|------|------|
| `apps/shukka/docs/prd/` | Product requirements: problem, users, goals/non-goals, flows, acceptance criteria |
| `apps/shukka/docs/adr/` | Architecture decisions: context, choice, alternatives, trade-offs, failure bounds |
| `apps/shukka/docs/spec.md` | Single source of truth for terminology, observable contracts, and system-wide invariants |

Read the relevant docs before changing feature code. Existing decisions live in `docs/adr/`, requirements in `docs/prd/`. Prefer updating those files over inventing parallel notes.

## Documentation rules

- Every completed feature 质问 leaves a PRD, at least one ADR when a material technical choice exists, and an update to `docs/spec.md` for any stable observable rule.
- `docs/spec.md` stays implementation-independent: shared terminology, externally observable contracts, and invariants. Put feature rationale in the PRD and decision rationale in ADRs.
- Use concise kebab-case filenames derived from the feature or decision (for example `docs/prd/cli-run.md`, `docs/adr/error-types.md`).
- Prefer testable product statements in PRDs. Do not hide unresolved product questions inside implementation TODOs.
- If code and docs disagree, surface the conflict during 质问 or before commit; do not silently pick one side.

## Commit and ship

Before any commit, review staged, unstaged, and untracked changes against `docs/spec.md` and every relevant document under `docs/adr/` and `docs/prd/`. If the implementation changes a documented fact, update and stage the documentation in the same change. Use `$git-commit` to stage logical groups and create conventional commits from the diff.

# Commands

Project: `shukka` — TanStack Start app (panel + API + update feed), SQLite via Drizzle, S3 for artifacts.

| Command | Purpose |
|---------|---------|
| `nr --filter shukka dev` | Panel and API on :3000 |
| `nr --filter shukka build` | Vite + Nitro build into `.output/` |
| `nr --filter shukka build:worker` | Cloudflare Worker build (`vite.config.worker.ts`) |
| `nr --filter shukka deploy:worker` | Worker build + `wrangler deploy` |
| `nr --filter shukka check:worker-size` | After `build:worker`, fail if wrangler dry-run gzip exceeds 3 MiB |
| `nr --filter shukka start` | Run the built server |
| `nr --filter shukka check` | `lint` + `typecheck` + `test` — run before commit |
| `nr --filter shukka lint` | oxlint |
| `nr --filter shukka generate:routes` | `tsr generate` — writes gitignored `src/routeTree.gen.ts` |
| `nr --filter shukka typecheck` | `tsc -b` (`pretypecheck` generates the route tree first) |
| `nr --filter shukka test` | vitest |
| `nr --filter shukka test:e2e` | electron-updater against a live instance (`SHUKKA_URL`) |
| `nr --filter shukka test:e2e:rollback` | Publish two releases, PATCH rollback, then feed + electron-updater (`SHUKKA_URL`, `SHUKKA_API_KEY`) |
| `nr --filter shukka test:e2e:tauri` | Tauri plugin-updater against a live instance (`SHUKKA_URL`) |
| `nr --filter shukka db:generate` | Regenerate `drizzle/` migrations after editing `src/db/schema.ts` |
| `actionlint apps/shukka/action.yml` | Lint the Action and workflows |

The runtime image `ghcr.io/shukka-app/shukka` is published by
`.github/workflows/docker.yml` on `main` and on `v*.*.*` tags
(workspace-root context, `file: apps/shukka/Dockerfile`).
`.github/workflows/docker-test.yml` builds that Dockerfile on PR / `main`
(no push) and walks health, setup, publish, feed, volume restart, and
electron-updater / rollback against the container. The same workflow starts
`apps/shukka/deploy/compose.yaml` and `apps/shukka/deploy/ansible/playbook.yml`
and walks health, setup, publish, and feed.

The GitHub Action is a node24 JavaScript action at `apps/shukka`
(`uses: shukka-app/shukka/apps/shukka@v2`; in-repo `uses: ./apps/shukka`).
It does not call bash. CI matrices MinIO and the JuiceFS S3 gateway on Ubuntu
(`.github/workflows/ci.yml` `s3` job, plus `.github/workflows/action-test.yml`
publish / Tauri jobs). Windows action e2e stays on MinIO (no Docker). The
action-test workflow then runs `apps/shukka/tests/e2e/` (Electron library + electron-updater)
against that published feed.

Layout:

| Path | Owns |
|------|------|
| `src/routes/` | Pages and server routes (thin — validation and delegation only) |
| `src/server/` | Domain services: apps, channels, releases, feed, dashboard read models |
| `src/lib/` | Infrastructure: storage, crypto, auth, typed errors, update-metadata parsing |
| `src/features/` | Panel feature UI and TanStack Query hooks |
| `src/components/ui/` | shadcn primitives, lightly themed (regular-weight titles) — keep close to upstream |
| `apps/shukka/scripts/shukka-upload.mjs` | Zero-dependency uploader shared by the action and manual use |
| `apps/shukka/scripts/updaters/` | Kind-specific collect + version inference for the uploader (plain ESM, no server imports) |

# Code style

- Prefer small modules with clear ownership boundaries over large catch-all files.
- Domain types and invariants belong in library code when the project grows past a single entry file.
- Errors should be typed where boundaries matter; avoid stringly-typed failure modes for contracts covered by the spec.
- Tests protect invariants and acceptance criteria from PRDs/spec, not implementation trivia.

# Note

`CLAUDE.md` is a symlink to this file — edit `AGENTS.md`.

This harness was installed by `hnm init`.

## Cursor Cloud specific instructions

Dependencies are installed by the environment update script (`npm install`). Standard scripts live in the `# Commands` table above and in `README.md`; the notes below are only the non-obvious gotchas.

- `nr --filter shukka typecheck` self-generates the route tree via `pretypecheck` (`tsr generate`).
- `nr --filter shukka dev` serves the panel + API on `:3000`. On a fresh database the root redirects to `/setup` to set the admin password before login.
- Creating an app end-to-end requires a reachable S3-compatible endpoint — the creation wizard validates bucket connectivity ("Verifying bucket…") and blocks with "Could not reach storage" otherwise. For local manual testing, run MinIO or `nr --filter shukka juicefs` (the same backends the CI S3 matrix uses) and in the wizard pick that provider. MinIO / JuiceFS both need **path-style** addressing (the wizard sets it).
