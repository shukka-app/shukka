import { readdir } from 'node:fs/promises'
import { basename } from 'node:path'

/** electron-builder sidecar names; also skipped by the Tauri collector. */
export const IGNORED = new Set(['.DS_Store', 'builder-debug.yml', 'builder-effective-config.yaml'])

/** Official `tauri build` platform folders under `target/<profile>/bundle/`. */
export const TAURI_BUNDLE_DIRS = new Set([
  'appimage',
  'deb',
  'rpm',
  'dmg',
  'macos',
  'ios',
  'nsis',
  'msi',
  'updater',
])

export function fail(message) {
  process.stdout.write(`::error::${message}\n`)
  process.exit(1)
}

export function isIgnoredName(name) {
  return name.startsWith('.') || IGNORED.has(name)
}

export function isYmlName(name) {
  return /\.ya?ml$/i.test(name) && !IGNORED.has(name)
}

export function isSharedLibrary(name) {
  return /\.(so|dylib|dll)(\.|$)/i.test(name)
}

/** Extract / unpack trees that sit beside updater artifacts. */
export function isSkippedTree(name) {
  return name.endsWith('.AppDir') || name.endsWith('.app') || name.endsWith('_extracted')
}

export function isKnownBundleDirName(name) {
  return TAURI_BUNDLE_DIRS.has(name.toLowerCase())
}

export function directoryLooksLikeTauri(directory, entries) {
  if (isKnownBundleDirName(basename(directory))) return true
  return entries.some((entry) => {
    if (entry.isFile() && (entry.name === 'latest.json' || entry.name.endsWith('.sig'))) return true
    if (entry.isDirectory() && isKnownBundleDirName(entry.name)) return true
    return false
  })
}

export function kindFromFilenames(filenames) {
  if (filenames.some((name) => isYmlName(name))) return 'electron'
  if (filenames.some((name) => name === 'latest.json' || name.endsWith('.sig'))) return 'tauri'
  return null
}

/**
 * Prefer files in the directory. yml wins so an Electron dist/ never becomes a
 * recursive Tauri walk. Override is SHUKKA_UPDATER_KIND / action updater-kind.
 */
export async function detectUpdaterKind(directory, override = '') {
  const requested = String(override ?? '')
    .trim()
    .toLowerCase()
  if (requested === 'electron' || requested === 'tauri') return requested
  if (requested) fail(`Unknown updater kind "${override}". Use electron or tauri.`)

  const entries = await readdir(directory, { withFileTypes: true })
  if (entries.some((entry) => entry.isFile() && isYmlName(entry.name))) return 'electron'
  if (directoryLooksLikeTauri(directory, entries)) return 'tauri'
  return 'electron'
}

export function normalizeVersion(value) {
  return String(value ?? '')
    .trim()
    .replace(/^v/, '')
}
