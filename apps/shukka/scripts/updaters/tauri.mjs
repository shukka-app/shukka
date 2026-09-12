import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import {
  fail,
  isIgnoredName,
  isKnownBundleDirName,
  isSharedLibrary,
  isSkippedTree,
  normalizeVersion,
} from './shared.mjs'

const FILENAME_VERSION = /_(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)_/
const VERSION_LIKE = /^(?:v)?\d+\.\d+/

const TAURI_VERSION_HELP =
  'Could not infer Tauri version. Set SHUKKA_VERSION or the action version input, include a latest.json with a "version" field, add a tauri.conf.json with "version" (searched upward from the directory), or use a version token in the artifact filename (for example _1.0.0_).'

/**
 * Collect updater artifacts + matching .sig + optional latest.json.
 * Recurse only into known bundle platform dirs. Publish basenames; fail on collisions.
 */
export async function collectTauriFiles(directory) {
  const byName = new Map()

  function addFile(file) {
    const existing = byName.get(file.filename)
    if (existing && existing.path !== file.path) {
      fail(
        `Basename collision: ${file.filename} appears as both ${existing.path} and ${file.path}. Rename one file or publish one platform directory at a time.`,
      )
    }
    if (!existing) byName.set(file.filename, file)
  }

  const entries = await readdir(directory, { withFileTypes: true })
  const atBundleRoot = entries.some((entry) => entry.isDirectory() && isKnownBundleDirName(entry.name))
  await walkTauri(directory, { enterPlatformDirs: atBundleRoot, addFile })

  const names = new Set(byName.keys())
  return [...byName.values()]
    .filter((file) => {
      if (file.filename === 'latest.json') return true
      if (file.filename.endsWith('.sig')) return names.has(file.filename.slice(0, -4))
      return names.has(`${file.filename}.sig`)
    })
    .sort((a, b) => a.filename.localeCompare(b.filename))
}

async function walkTauri(directory, { enterPlatformDirs, addFile }) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (isSkippedTree(entry.name) || isIgnoredName(entry.name)) continue
      if (enterPlatformDirs && isKnownBundleDirName(entry.name)) {
        await walkTauri(join(directory, entry.name), { enterPlatformDirs: false, addFile })
      }
      continue
    }
    if (!entry.isFile() || isIgnoredName(entry.name) || isSharedLibrary(entry.name)) continue
    const path = join(directory, entry.name)
    addFile({ filename: entry.name, path, size: (await stat(path)).size })
  }
}

/**
 * Order after an explicit SHUKKA_VERSION / action version: latest.json →
 * nearest tauri.conf.json → `_1.0.0_` in a filename → fail naming those options.
 * Does not synthesize latest.json.
 */
export async function inferTauriVersion(files, directory) {
  const latestJson = files.find((file) => file.filename === 'latest.json')
  if (latestJson) return versionFromLatestJson(latestJson)

  const fromDirectory = directory ?? (files[0] ? dirname(files[0].path) : '')
  if (fromDirectory) {
    const fromConf = await versionFromNearestTauriConf(fromDirectory)
    if (fromConf) return fromConf
  }

  const fromFilename = versionsFromFilenames(files)
  if (fromFilename.length === 1) return fromFilename[0]
  if (fromFilename.length > 1) {
    fail(
      `Artifact filenames disagree on version (${fromFilename.join(', ')}). Set SHUKKA_VERSION or the action version input.`,
    )
  }

  fail(TAURI_VERSION_HELP)
}

async function versionFromLatestJson(file) {
  let parsed
  try {
    parsed = JSON.parse(await readFile(file.path, 'utf8'))
  } catch {
    fail('Could not read "version" from latest.json')
  }
  const version = normalizeVersion(typeof parsed?.version === 'string' ? parsed.version : '')
  if (!version) fail('Could not read "version" from latest.json')
  return version
}

async function versionFromNearestTauriConf(directory) {
  let current = resolve(directory)
  const { root } = parse(current)
  while (true) {
    const confPath = join(current, 'tauri.conf.json')
    try {
      const parsed = JSON.parse(await readFile(confPath, 'utf8'))
      const raw = typeof parsed?.version === 'string' ? parsed.version.trim() : ''
      if (raw && VERSION_LIKE.test(raw)) return normalizeVersion(raw)
      if (raw && (raw.endsWith('package.json') || raw.includes('/') || raw.includes('\\'))) {
        try {
          const pkg = JSON.parse(await readFile(resolve(current, raw), 'utf8'))
          const version = normalizeVersion(typeof pkg?.version === 'string' ? pkg.version : '')
          if (version && VERSION_LIKE.test(version)) return version
        } catch {
          /* keep walking */
        }
      }
    } catch {
      /* missing or invalid, keep walking */
    }
    if (current === root) break
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return ''
}

function versionsFromFilenames(files) {
  const found = new Set()
  for (const file of files) {
    const match = file.filename.match(FILENAME_VERSION)
    if (match) found.add(match[1])
  }
  return [...found]
}
