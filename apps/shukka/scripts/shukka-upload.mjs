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

export function parseApiBody(text) {
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.replace(/\s+/g, ' ').trim().slice(0, 200) }
  }
}

export async function apiRequest(serverUrl, method, path, apiKey, body) {
  const headers = { authorization: `Bearer ${apiKey}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${serverUrl.replace(/\/+$/, '')}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await response.text()
  return { status: response.status, ok: response.ok, payload: parseApiBody(text) }
}

async function callApi(serverUrl, path, apiKey, body) {
  const result = await apiRequest(serverUrl, 'POST', path, apiKey, body)
  if (!result.ok) fail(`${path} failed (${result.status}): ${result.payload.message ?? ''}`)
  return result.payload
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

export function parseReleaseMetadata(text) {
  let metadata
  try {
    metadata = JSON.parse(text, (_key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite JSON number')
      return value
    })
  } catch {
    fail('metadata must be valid JSON')
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    fail('metadata must be a JSON object')
  }
  if (Buffer.byteLength(JSON.stringify(metadata), 'utf8') > 16 * 1024) {
    fail('metadata must not exceed 16 KiB of UTF-8 JSON')
  }
  return metadata
}

const RETRYABLE_STATUS = (status) => status === 429 || status >= 500

/** Finalizes; on network error / 5xx checks whether the version already exists before retrying. */
export async function finalizeWithRetry(serverUrl, apiKey, { app, channel, version, uploadId, release, metadata }, attempts = MAX_ATTEMPTS) {
  let lastError = ''
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let result
    try {
      result = await apiRequest(serverUrl, 'POST', '/api/v1/upload/finalize', apiKey, { app, uploadId, release, metadata })
    } catch (error) {
      lastError = error.message
    }
    if (result?.ok) return result.payload
    if (result && !RETRYABLE_STATUS(result.status)) {
      fail(`/api/v1/upload/finalize failed (${result.status}): ${result.payload.message ?? ''}`)
    }
    if (result) lastError = `status ${result.status}`
    // A lost response may hide a successful finalize; a bound key can read drafts.
    const probe = await apiRequest(serverUrl, 'GET', `/api/v1/apps/${encodeURIComponent(app)}/channels/${encodeURIComponent(channel)}/versions/${encodeURIComponent(version)}/metadata`, apiKey).catch(() => null)
    if (probe?.ok) return { version, channel }
    if (attempt < attempts) await new Promise((done) => setTimeout(done, 2 ** attempt * 500))
  }
  fail(`/api/v1/upload/finalize failed after ${attempts} attempts: ${lastError}`)
}

async function main() {
  const serverUrl = required('server-url', readInput('server-url', 'SHUKKA_SERVER_URL'))
  const apiKey = required('api-key', readInput('api-key', 'SHUKKA_API_KEY'))
  const app = required('app', readInput('app', 'SHUKKA_APP'))
  const channel = readInput('channel', 'SHUKKA_CHANNEL', 'stable')
  const directory = resolve(readInput('directory', 'SHUKKA_DIRECTORY', 'dist'))
  const createChannel = readInput('create-channel', 'SHUKKA_CREATE_CHANNEL') === 'true'
  const release = readInput('release', 'SHUKKA_RELEASE') === 'true'
  const metadata = parseReleaseMetadata(readInput('metadata', 'SHUKKA_METADATA', '{}'))
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

  const result = await finalizeWithRetry(serverUrl, apiKey, { app, channel, version, uploadId: init.uploadId, release, metadata })
  process.stdout.write(`Published ${result.version} to ${result.channel}\n`)

  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nchannel=${result.channel}\n`)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => fail(error.stack ?? String(error)))
}
