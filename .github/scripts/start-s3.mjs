#!/usr/bin/env node
// Starts the S3 backend selected by argv / S3_BACKEND (minio | juicefs).
// MinIO is a Docker server; JuiceFS reuses apps/shukka/scripts/juicefs-dev.mjs (gateway).
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKENDS = new Set(['minio', 'juicefs'])
const backend = process.argv[2] ?? process.env.S3_BACKEND ?? 'minio'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const endpoint = process.env.S3_URL ?? process.env.MINIO_URL ?? 'http://localhost:9000'
const accessKey = process.env.S3_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY ?? 'shukka'
const secretKey = process.env.S3_SECRET_KEY ?? process.env.MINIO_SECRET_KEY ?? 'shukkasecret'
const bucket = process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? 'releases'

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', ...options })
  if (result.error?.code === 'ENOENT') fail('Docker is not installed.')
  return result
}

function waitFor(url) {
  return new Promise((resolveWait, reject) => {
    const child = spawn(process.execPath, [resolve(here, 'wait-for.mjs'), url], { stdio: 'inherit' })
    child.on('exit', (code) => {
      if (code === 0) resolveWait()
      else reject(new Error(`Timed out waiting for ${url}`))
    })
  })
}

async function startMinio() {
  const existing = docker(['inspect', '--format', '{{.State.Status}}', 'minio'])
  if (existing.status === 0 && existing.stdout.trim() === 'running') {
    process.stdout.write('MinIO container is already running\n')
  } else {
    process.stdout.write('Starting MinIO\n')
    const started = docker(
      [
        'run',
        '-d',
        '--name',
        'minio',
        '-p',
        '9000:9000',
        '-e',
        `MINIO_ROOT_USER=${accessKey}`,
        '-e',
        `MINIO_ROOT_PASSWORD=${secretKey}`,
        'quay.io/minio/minio',
        'server',
        '/data',
      ],
      { stdio: 'inherit' },
    )
    if (started.status !== 0) fail('Could not start MinIO')
  }

  await waitFor(`${endpoint.replace(/\/+$/, '')}/minio/health/live`)
  const mkdir = docker(['exec', 'minio', 'mkdir', '-p', `/data/${bucket}`])
  if (mkdir.status !== 0) fail(`Could not create MinIO bucket directory /data/${bucket}`)
  process.stdout.write(`MinIO ready at ${endpoint} (bucket ${bucket})\n`)
}

function startJuicefs() {
  const script = resolve(repoRoot, 'apps/shukka/scripts/juicefs-dev.mjs')
  const started = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (started.status !== 0) fail('Could not start the JuiceFS S3 gateway')
}

if (!BACKENDS.has(backend)) {
  fail(`Unknown S3 backend "${backend}". Use one of: ${[...BACKENDS].join(', ')}`)
}

if (backend === 'juicefs') {
  startJuicefs()
} else {
  await startMinio()
}
