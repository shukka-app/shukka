import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, isIgnoredName, isYmlName } from './shared.mjs'

/** Flat directory only — installers, blockmaps, latest*.yml. Do not recurse. */
export async function collectElectronFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || isIgnoredName(entry.name)) continue
    const path = join(directory, entry.name)
    files.push({ filename: entry.name, path, size: (await stat(path)).size })
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename))
}

export async function inferElectronVersion(files) {
  const metadata = files.find((file) => isYmlName(file.filename))
  if (metadata) {
    const match = (await readFile(metadata.path, 'utf8')).match(/^version:\s*(.+)$/m)
    if (!match) fail(`Could not read "version" from ${metadata.filename}`)
    return match[1].trim().replace(/^['"]|['"]$/g, '')
  }
  fail('No electron-updater latest*.yml metadata file found in the directory')
}
