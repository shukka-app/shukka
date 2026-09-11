import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, isIgnoredName, isSparkleArchiveName } from './shared.mjs'

/** Flat directory only — appcast.xml, archives, matching .sig. Do not recurse. */
export async function collectSparkleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || isIgnoredName(entry.name)) continue
    const path = join(directory, entry.name)
    files.push({ filename: entry.name, path, size: (await stat(path)).size })
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename))
}

/** `App-1.4.2.zip` / `App_1.4.2.dmg` — marketing version token before the archive suffix. */
export function versionFromSparkleFilename(filename) {
  const match = filename.match(/[-_](\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?)\.(?:zip|dmg|aar|tgz|tar\.)/i)
  return match?.[1] ?? ''
}

export async function inferSparkleVersion(files) {
  const appcast = files.find((file) => file.filename === 'appcast.xml')
  if (appcast) {
    const text = await readFile(appcast.path, 'utf8')
    const short =
      text.match(/<sparkle:shortVersionString>([^<]+)<\/sparkle:shortVersionString>/)?.[1] ??
      text.match(/sparkle:shortVersionString="([^"]+)"/)?.[1]
    const build =
      text.match(/<sparkle:version>([^<]+)<\/sparkle:version>/)?.[1] ??
      text.match(/sparkle:version="([^"]+)"/)?.[1]
    const version = (short || build || '').trim()
    if (!version) fail('Could not read sparkle:shortVersionString or sparkle:version from appcast.xml')
    return version
  }

  for (const file of files) {
    if (!isSparkleArchiveName(file.filename)) continue
    const version = versionFromSparkleFilename(file.filename)
    if (version) return version
  }

  fail(
    'Could not infer a Sparkle version. Set SHUKKA_VERSION / Action version, include appcast.xml, or name the archive like App-1.4.2.zip',
  )
}
