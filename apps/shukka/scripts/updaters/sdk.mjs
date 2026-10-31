import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Free-form mode: every file in the build directory is an artifact. No
 * conventions, no classification, no filtering by name — `builder-debug.yml`,
 * `latest.yml`, manifests and payloads all upload as themselves.
 *
 * Dotfiles are the one exception: the upload protocol rejects filenames that
 * start with ".", so a file like `.DS_Store` would fail init for the whole
 * directory.
 */
export async function collectSdkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    files.push({ filename: entry.name, path, size: (await stat(path)).size })
  }
  return files.sort((a, b) => a.filename.localeCompare(b.filename))
}
