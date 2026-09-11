#!/usr/bin/env node
/**
 * Starts a local JuiceFS S3 gateway for Shukka development, as a single container.
 * Idempotent: a running container is reused as-is, and if port 9000 already
 * serves S3 (e.g. the shukka-minio dev container) it is reused too — only a
 * non-S3 listener on the port is treated as a conflict.
 *
 * JuiceFS keeps metadata in SQLite and data chunks on local disk, both inside the
 * shukka-juicefs-data volume, and serves a MinIO-compatible S3 API on port 9000.
 * The gateway exposes one bucket named "releases" (--bucket-name) backed by the
 * volume root, so the bucket exists as soon as the gateway is healthy — no bucket
 * creation step is needed. Credentials match the MinIO / JuiceFS CI matrix used
 * by .github/workflows/ci.yml and .github/workflows/action-test.yml.
 *
 * Note: the juicedata/juicefs Docker Hub repository ships a Docker volume plugin,
 * not a runnable CLI image, so this uses juicedata/mount (community edition, pinned)
 * which contains the juicefs binary and no entrypoint.
 *
 * Zero dependencies so it runs anywhere Node runs.
 */
import { spawnSync } from 'node:child_process'
import { connect } from 'node:net'

const IMAGE = 'juicedata/mount:ce-v1.4.1'
const CONTAINER = 'shukka-juicefs'
const VOLUME = 'shukka-juicefs-data'
const PORT = 9000
const ENDPOINT = `http://localhost:${PORT}`
const BUCKET = 'releases'
const ACCESS_KEY = 'shukka'
const SECRET_KEY = 'shukkasecret'
const HEALTH_URL = `${ENDPOINT}/minio/health/live`
const HEALTH_TIMEOUT_MS = 30_000

// Format runs once per volume; afterwards the gateway stays in the foreground.
// Parses as ([ -f ... ] || format) && exec — a failed format must not start the gateway.
const CONTAINER_COMMAND =
  '[ -f /data/jfs.db ] || juicefs format sqlite3:///data/jfs.db myjfs --storage file --bucket /data/jfs' +
  ' && exec juicefs gateway sqlite3:///data/jfs.db 0.0.0.0:9000 --bucket-name releases'

function fail(message) {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  return { ok: result.status === 0, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error }
}

function ensureDocker() {
  const result = docker(['info'])
  if (result.error?.code === 'ENOENT') fail('Docker is not installed. Install Docker, OrbStack or Colima and try again.')
  if (!result.ok) fail('The Docker daemon is not running. Start it and try again.')
}

/** Returns the container's state ("running", "exited", ...), or null when absent. */
function containerState() {
  const result = docker(['inspect', '--format', '{{.State.Status}}', CONTAINER])
  return result.ok ? result.stdout.trim() : null
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

/** Best-effort identification of whatever is bound to the gateway port. */
function portOccupier(port) {
  const ps = docker(['ps', '--format', '{{.Names}}\t{{.Ports}}'])
  const line = ps.stdout.split('\n').find((entry) => entry.includes(`:${port}->`))
  if (line) return `Docker container "${line.split('\t')[0]}"`
  return `another process (inspect with: lsof -nP -iTCP:${port} -sTCP:LISTEN)`
}

/**
 * An existing listener on the gateway port is fine when it answers S3 requests
 * (e.g. the shukka-minio dev container) — the wizard talks to it the same way.
 * Only a non-S3 occupant is a real conflict.
 */
async function s3ServiceListening(port) {
  try {
    const response = await fetch(`http://localhost:${port}/${BUCKET}`, {
      headers: { authorization: 'AWS4-HMAC-SHA256 probe' },
    })
    const body = await response.text()
    // S3 implementations reject the bogus signature with an XML error body
    // (status varies: 400/403); a non-S3 listener answers something else.
    return body.includes('<Code>') && body.includes('</Error>')
  } catch {
    return false
  }
}

function ensureImage() {
  if (docker(['image', 'inspect', IMAGE]).ok) return
  process.stdout.write(`Pulling ${IMAGE}...\n`)
  const pulled = spawnSync('docker', ['pull', IMAGE], { stdio: 'inherit' })
  if (pulled.status !== 0) fail(`Could not pull ${IMAGE}`)
}

function recentLogs() {
  const logs = docker(['logs', '--tail', '30', CONTAINER])
  return `${logs.stdout}${logs.stderr}`.trim()
}

async function waitForHealth() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH_URL)
      if (response.ok) return
    } catch {
      // Gateway is not accepting connections yet.
    }
    if (containerState() !== 'running') {
      fail(`Container ${CONTAINER} exited while starting up.\n\nRecent logs:\n${recentLogs()}`)
    }
    await new Promise((done) => setTimeout(done, 1000))
  }
  fail(`Timed out waiting for ${HEALTH_URL}.\n\nRecent logs:\n${recentLogs()}`)
}

function printInfo() {
  const lines = [
    'JuiceFS dev stack ready — enter these in the Shukka wizard:',
    '',
    'Provider:          JuiceFS',
    `Endpoint:          ${ENDPOINT}`,
    `Bucket:            ${BUCKET}`,
    `Access key ID:     ${ACCESS_KEY}`,
    `Secret access key: ${SECRET_KEY}`,
    'Key prefix:        my-app (use your app slug)',
    '',
    `Stop:  docker stop ${CONTAINER}`,
    `Reset: docker rm -f ${CONTAINER} && docker volume rm ${VOLUME}`,
  ]
  const width = Math.max(...lines.map((line) => line.length))
  const bar = '─'.repeat(width + 2)
  const body = lines.map((line) => `│ ${line.padEnd(width)} │`).join('\n')
  process.stdout.write(`╭${bar}╮\n${body}\n╰${bar}╯\n`)
}

async function main() {
  ensureDocker()

  const state = containerState()
  if (state === 'running') {
    process.stdout.write(`Container ${CONTAINER} is already running — nothing to set up.\n\n`)
    printInfo()
    return
  }

  if (await portInUse(PORT)) {
    if (await s3ServiceListening(PORT)) {
      process.stdout.write(`Port ${PORT} already serves S3 (${portOccupier(PORT)}) — reusing it.\n\n`)
      printInfo()
      return
    }
    fail(`Port ${PORT} is already bound by ${portOccupier(PORT)}. Stop it (or change its port) and try again.`)
  }

  if (state) {
    process.stdout.write(`Starting existing container ${CONTAINER}...\n`)
    const started = docker(['start', CONTAINER])
    if (!started.ok) {
      fail(
        `Could not start ${CONTAINER}: ${started.stderr.trim()}\n` +
          `Full reset: docker rm -f ${CONTAINER} && docker volume rm ${VOLUME}`,
      )
    }
  } else {
    ensureImage()
    process.stdout.write(`Creating container ${CONTAINER} (${IMAGE})...\n`)
    const created = docker([
      'run',
      '-d',
      '--name',
      CONTAINER,
      '-p',
      `${PORT}:9000`,
      '-v',
      `${VOLUME}:/data`,
      '-e',
      `MINIO_ROOT_USER=${ACCESS_KEY}`,
      '-e',
      `MINIO_ROOT_PASSWORD=${SECRET_KEY}`,
      IMAGE,
      'bash',
      '-c',
      CONTAINER_COMMAND,
    ])
    if (!created.ok) fail(`Could not create ${CONTAINER}: ${created.stderr.trim()}`)
  }

  await waitForHealth()
  process.stdout.write('\n')
  printInfo()
}

main().catch((error) => fail(error.stack ?? String(error)))
