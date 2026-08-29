export const UPDATER_KINDS = ['electron', 'tauri', 'sparkle'] as const

export type UpdaterKind = (typeof UPDATER_KINDS)[number]

export function isUpdaterKind(value: unknown): value is UpdaterKind {
  return value === 'electron' || value === 'tauri' || value === 'sparkle'
}

export function updaterKindLabelKey(kind: UpdaterKind): 'kindElectron' | 'kindTauri' | 'kindSparkle' {
  if (kind === 'sparkle') return 'kindSparkle'
  if (kind === 'tauri') return 'kindTauri'
  return 'kindElectron'
}
