import type { UpdaterKind } from '~/lib/updater-kind.ts'
import { electronAdapter } from './electron.ts'
import { sdkAdapter } from './sdk.ts'
import { sparkleAdapter } from './sparkle.ts'
import { tauriAdapter } from './tauri.ts'
import type { UpdateAdapter } from './types.ts'

const adapters: Record<UpdaterKind, UpdateAdapter> = {
  electron: electronAdapter,
  tauri: tauriAdapter,
  sparkle: sparkleAdapter,
  sdk: sdkAdapter,
}

export function adapterFor(kind: UpdaterKind): UpdateAdapter {
  return adapters[kind]
}

export type { UpdateAdapter } from './types.ts'
