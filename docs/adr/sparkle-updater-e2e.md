# ADR: Sparkle e2e bound — XML + EdDSA on Linux, framework on macOS

## Status

Accepted.

## Context

Electron and Tauri e2e launch the real updater (`electron-updater`, `tauri-plugin-updater`) and assert check + download + signature, not install. Sparkle.framework is macOS-only. Ubuntu CI (and this repo’s default `npm test`) cannot load it.

HTTP tests can prove: one-item appcast, draft 404, rollback pointer, enclosure 302, `sparkle:edSignature` + `length` present, and that an Ed25519 signature over the artifact bytes matches the enclosure attribute.

They cannot prove Sparkle’s own `SPUUpdater` request shape or ATS behavior.

## Decision

1. **Required on every platform** (`npm test`): upload rules, generated one-item appcast, draft invisibility, rollback, artifact 302, and cryptographic check that `sparkle:edSignature` verifies the enclosure bytes (Node `crypto` Ed25519, same algorithm Sparkle’s `sign_update` uses).
2. **Optional live Linux script** (`npm run test:e2e:sparkle`): against `SHUKKA_URL` / `SHUKKA_API_KEY`, publish a signed zip, `GET` the appcast, follow the enclosure 302, verify EdDSA. No Sparkle.framework. Does not call install.
3. **Required on `macos-latest`** (`.github/workflows/action-test.yml` job `sparkle-updater`): same-runner MinIO + Shukka, Action publish with `updater-kind: sparkle`, then a Swift CLI (`tests/e2e/sparkle-check`) that loads Sparkle.framework, points a dummy host bundle at the feed (`SUFeedURL` + `SUPublicEDKey`), runs `SPUUpdater.checkForUpdates()`, downloads the enclosure, and **stops before a real install**. Same install bound as Electron / Tauri: no `quitAndInstall` / app replacement. The host `Dummy.app` is not the running process, so Sparkle often skips `showReady(toInstallAndRelaunch:)` and calls `showInstallingUpdate`; the driver exits there after a successful download and does not invoke `retryTerminatingApplication`.
4. Shukka still does **not** run `generate_keys` / `sign_update` / `generate_appcast`. The macOS job may sign the fixture with Node Ed25519 (same algorithm) so the framework can verify `SUPublicEDKey`.
5. Linux CI does not download Sparkle binaries or launch a dummy `.app`.

## Alternatives

- **Block the adapter until macos-latest exists**: rejected; Linux XML+EdDSA shipped first, then the Swift job landed on the same PR.
- **Vendor Sparkle tools in the repo**: large binaries; the job fetches Sparkle via Swift Package Manager instead.
- **Parse the appcast in Swift without `SPUUpdater`**: cheaper, but would not exercise Sparkle’s real check/download/EdDSA path that issue #25 asked for.

## Trade-offs and failure bounds

- A Sparkle release that changes how the client picks `sparkle:version` vs `shortVersionString` would not be caught on Linux. The mapping is pinned in `docs/adr/sparkle-current-only-appcast.md` and enforced at finalize. The macOS job publishes a version newer than the dummy bundle’s `CFBundleVersion` so Sparkle offers it.
- ATS / HTTPS is a deploy constraint. The dummy bundle sets `NSAllowsLocalNetworking` / `NSAllowsArbitraryLoads` so `http://localhost` works on the runner.
- After download/extract, `SPUUserDriver` dismisses at `showReady(toInstallAndRelaunch:)` when Sparkle offers it. When the host bundle is not running, Sparkle skips that callback and the driver treats `showInstallingUpdate` after a successful download as the same stop (exit, no `retryTerminatingApplication`). Extraction into a temp directory is part of Sparkle’s download path, not install. The macOS fixture must be a real zip of `Dummy.app` (same bundle id and folder name as the host) whose Info.plist keeps `SUPublicEDKey` — Sparkle forbids removing the host’s EdDSA key after extract (`SUInstallationError` 4005). The executable is an unsigned stub, not a copy of `/usr/bin/true`. `prepare-sparkle-release.mjs` packs with `ditto -c -k` on macOS (Sparkle extracts with `ditto -x -k`) and with a stored ZIP elsewhere. A text file named `.zip` passes EdDSA and then fails Sparkle’s unarchiver.
- The Swift package pins Sparkle **2.9.6** (SPM binary) so the overlay method names (`show(_:reply:)`, `showReady(toInstallAndRelaunch:)`) stay compile-stable on `macos-latest`.
