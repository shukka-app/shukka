export const UPDATER_KINDS = ['electron', 'tauri', 'sparkle', 'sdk'] as const

export type UpdaterKind = (typeof UPDATER_KINDS)[number]

export function isUpdaterKind(value: unknown): value is UpdaterKind {
  return value === 'electron' || value === 'tauri' || value === 'sparkle' || value === 'sdk'
}

export function updaterKindLabelKey(kind: UpdaterKind): 'kindElectron' | 'kindTauri' | 'kindSparkle' | 'kindSdk' {
  if (kind === 'sparkle') return 'kindSparkle'
  if (kind === 'tauri') return 'kindTauri'
  if (kind === 'sdk') return 'kindSdk'
  return 'kindElectron'
}
