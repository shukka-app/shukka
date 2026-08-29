#!/usr/bin/env node
/**
 * Produces a multi-platform Tauri updater directory: one signed-looking
 * archive name per {os}-{arch} that the Tauri adapter's inferFeedTarget
 * understands, plus
 * matching .sig files written by the caller (`tauri signer sign`).
 */
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const directory = process.argv[2] ?? 'out'
const version = process.argv[3] ?? '1.0.0'

await mkdir(directory, { recursive: true })

const artifacts = [
  `demo-app-${version}-aarch64.app.tar.gz`,
  `demo-app-${version}-x86_64.app.tar.gz`,
  `demo-app-${version}-linux-x86_64.AppImage`,
  `demo-app-${version}-windows-x86_64.exe`,
]

const written = []
for (const name of artifacts) {
  await writeFile(join(directory, name), randomBytes(64 * 1024))
  written.push(name)
}

process.stdout.write(`Wrote ${directory}/ {${written.join(', ')}} (v${version})\n`)
