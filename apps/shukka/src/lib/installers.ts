/**
 * Panel display rules for installer tiles. Filename heuristics only — not
 * feed coverage (`platformsOf`) and not an API allowlist.
 */

export type InstallerOs = 'windows' | 'macos' | 'linux'
export type InstallerArch = 'x64' | 'arm' | 'universal'

export type ClassifiedInstaller = {
  filename: string
  os: InstallerOs
  arch: InstallerArch
  extension: string
}

const HIDDEN = /\.(ya?ml|blockmap|sig)$/i
const LATEST_JSON = /^latest\.json$/i
const APPCAST = /^appcast\.xml$/i

const EXTENSIONS: { suffix: string; os: InstallerOs; display: string }[] = [
  { suffix: '.app.tar.gz', os: 'macos', display: '.app.tar.gz' },
  { suffix: '.appimage', os: 'linux', display: '.AppImage' },
  { suffix: '.exe', os: 'windows', display: '.exe' },
  { suffix: '.msi', os: 'windows', display: '.msi' },
  { suffix: '.dmg', os: 'macos', display: '.dmg' },
  { suffix: '.deb', os: 'linux', display: '.deb' },
  { suffix: '.rpm', os: 'linux', display: '.rpm' },
  { suffix: '.zip', os: 'macos', display: '.zip' },
]

const OS_ORDER: Record<InstallerOs, number> = { windows: 0, macos: 1, linux: 2 }
const ARCH_ORDER: Record<InstallerArch, number> = { x64: 0, arm: 1, universal: 2 }

function inferArch(filename: string): InstallerArch | null {
  if (/universal/i.test(filename)) return 'universal'
  if (/i686|ia32/i.test(filename)) return null
  if (/arm64|aarch64|armv[678]|[-_.]arm(?:[-_.]|$)/i.test(filename)) return 'arm'
  return 'x64'
}

export function classifyInstaller(filename: string): ClassifiedInstaller | null {
  if (HIDDEN.test(filename) || LATEST_JSON.test(filename) || APPCAST.test(filename)) return null
  const lower = filename.toLowerCase()
  const ext = EXTENSIONS.find((entry) => lower.endsWith(entry.suffix))
  if (!ext) return null
  if (ext.suffix === '.zip' && !/mac|darwin|osx/i.test(filename)) return null
  const arch = inferArch(filename)
  if (!arch) return null
  return { filename, os: ext.os, arch, extension: ext.display }
}

export function installersOf(filenames: readonly string[]): ClassifiedInstaller[] {
  return filenames
    .map(classifyInstaller)
    .filter((tile): tile is ClassifiedInstaller => tile != null)
    .sort((a, b) => {
      const os = OS_ORDER[a.os] - OS_ORDER[b.os]
      if (os) return os
      const arch = ARCH_ORDER[a.arch] - ARCH_ORDER[b.arch]
      if (arch) return arch
      const ext = a.extension.localeCompare(b.extension)
      if (ext) return ext
      return a.filename.localeCompare(b.filename)
    })
}
