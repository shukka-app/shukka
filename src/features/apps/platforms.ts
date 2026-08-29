import type { UpdaterKind } from '~/lib/updater-kind.ts'
import type { VersionDetail } from '~/server/dashboard.ts'
import { adapterFor } from '~/server/updaters/index.ts'

/**
 * Platforms covered by a release. Delegates to the app's update adapter
 * (`updaterKind`): Electron reads builder metadata names; Tauri infers
 * from updater artifact filenames via `inferFeedTarget`; Sparkle is macOS.
 */
export function platformsOf(version: VersionDetail, kind: UpdaterKind = 'electron'): string[] {
  return adapterFor(kind).platformsOf(version.artifacts)
}
