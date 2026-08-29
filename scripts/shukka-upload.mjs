#!/usr/bin/env node
/**
 * Publishes an electron-builder, Tauri, or Sparkle output directory to Shukka as one version.
 *
 * Protocol (docs/adr/presigned-direct-upload.md):
 *   init -> presigned PUT per file -> direct upload to S3 -> finalize
 *
 * Zero dependencies so the JavaScript action can run it without a build step.
 * Kind-specific collect/version live in scripts/updaters/*.mjs (do not import ~/server).
 */
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectElectronFiles, inferElectronVersion } from './updaters/electron.mjs'
import { detectUpdaterKind, fail, kindFromFilenames } from './updaters/shared.mjs'
import { collectSparkleFiles, inferSparkleVersion } from './updaters/sparkle.mjs'
import { collectTauriFiles, inferTauriVersion } from './updaters/tauri.mjs'

const MAX_ATTEMPTS = 3

function required(name, value) {
  if (!value) fail(`Missing required input: ${name}`)
  return value
}

/**
 * Standalone CI sets SHUKKA_*; a JavaScript action exposes inputs as INPUT_*.
 * `server-url` becomes `INPUT_SERVER-URL` (hyphens kept, per Actions metadata).
 */
export function readInput(actionInput, envName, fallback = '') {
  return process.env[envName] || process.env[`INPUT_${actionInput.toUpperCase()}`] || fallback
}

export { detectUpdaterKind, fail }

export async function collectFiles(directory, kind) {
  const resolved = kind ?? (await detectUpdaterKind(directory))
  if (resolved === 'tauri') return collectTauriFiles(directory)
  if (resolved === 'sparkle') return collectSparkleFiles(directory)
  return collectElectronFiles(directory)
}

export async function versionFromMetadata(files, directory, kind) {
  const resolved = kind ?? kindFromFilenames(files.map((file) => file.filename)) ?? 'electron'
  if (resolved === 'tauri') return inferTauriVersion(files, directory)
  if (resolved === 'sparkle') return inferSparkleVersion(files)
  return inferElectronVersion(files)
}

async function callApi(serverUrl, path, apiKey, body) {
  const response = await fetch(`${serverUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}
  if (!response.ok) fail(`${path} failed (${response.status}): ${payload.message ?? text}`)
  return payload
}

async function putFile(uploadUrl, file) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        // Node streams need duplex:'half' to send a body without buffering it in memory.
        body: createReadStream(file.path),
        duplex: 'half',
        headers: { 'content-length': String(file.size) },
      })
      if (response.ok) return
      if (attempt === MAX_ATTEMPTS) fail(`Upload of ${file.filename} failed with status ${response.status}`)
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) fail(`Upload of ${file.filename} failed: ${error.message}`)
    }
    await new Promise((done) => setTimeout(done, 2 ** attempt * 500))
  }
}

async function main() {
  const serverUrl = required('server-url', readInput('server-url', 'SHUKKA_SERVER_URL'))
  const apiKey = required('api-key', readInput('api-key', 'SHUKKA_API_KEY'))
  const app = required('app', readInput('app', 'SHUKKA_APP'))
  const channel = readInput('channel', 'SHUKKA_CHANNEL', 'stable')
  const directory = resolve(readInput('directory', 'SHUKKA_DIRECTORY', 'dist'))
  const createChannel = readInput('create-channel', 'SHUKKA_CREATE_CHANNEL') === 'true'
  const release = readInput('release', 'SHUKKA_RELEASE') === 'true'
  const kind = await detectUpdaterKind(directory, readInput('updater-kind', 'SHUKKA_UPDATER_KIND'))

  const files = await collectFiles(directory, kind)
  if (files.length === 0) fail(`No files to publish in ${directory}`)

  const version =
    readInput('version', 'SHUKKA_VERSION') || (await versionFromMetadata(files, directory, kind))
  process.stdout.write(`Publishing ${app} ${version} to channel ${channel} (${files.length} files)\n`)

  const init = await callApi(serverUrl, '/api/v1/upload/init', apiKey, {
    app,
    channel,
    version,
    createChannel,
    files: files.map((file) => ({ filename: file.filename, size: file.size })),
  })

  const byName = new Map(files.map((file) => [file.filename, file]))
  for (const target of init.files) {
    const file = byName.get(target.filename)
    process.stdout.write(`  ↑ ${target.filename} (${(file.size / 1024 / 1024).toFixed(1)} MB)\n`)
    await putFile(target.uploadUrl, file)
  }

  const result = await callApi(serverUrl, '/api/v1/upload/finalize', apiKey, { app, uploadId: init.uploadId, release })
  process.stdout.write(`Published ${result.version} to ${result.channel}\n`)

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nchannel=${result.channel}\n`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => fail(error.stack ?? String(error)))
}
