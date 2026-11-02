#!/usr/bin/env node
// Starts the S3 backend selected by argv / S3_BACKEND (fakes3 | juicefs).
// fakes3 is an in-memory S3 server for tests (Docker); JuiceFS reuses
// apps/shukka/scripts/juicefs-dev.mjs (gateway).
//
// fakes3 runs with --auth, so it verifies SigV4 on every request, presigned
// URLs included. It only runs on Linux, so the Windows / macOS runners (no
// Docker) still use the MinIO binary via start-minio.mjs.
import { spawn, spawnSync } from 'node:child_process'
import { devNull } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKENDS = new Set(['fakes3', 'juicefs'])
const backend = process.argv[2] ?? process.env.S3_BACKEND ?? 'fakes3'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const endpoint = process.env.S3_URL ?? process.env.MINIO_URL ?? 'http://localhost:9000'
const accessKey = process.env.S3_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY ?? 'shukka'
const secretKey = process.env.S3_SECRET_KEY ?? process.env.MINIO_SECRET_KEY ?? 'shukkasecret'
const bucket = process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? 'releases'

const FAKES3_IMAGE = 'ghcr.io/akarachen/fakes3:0.1.0'

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

async function startFakes3() {
  const existing = docker(['inspect', '--format', '{{.State.Status}}', 'fakes3'])
  if (existing.status === 0 && existing.stdout.trim() === 'running') {
    process.stdout.write('fakes3 container is already running\n')
  } else {
    process.stdout.write('Starting fakes3\n')
    const started = docker(
      [
        'run',
        '-d',
        '--name',
        'fakes3',
        '-p',
        '9000:9000',
        '-e',
        'FAKES3_AUTH=1',
        '-e',
        `FAKES3_ACCESS_KEY=${accessKey}`,
        '-e',
        `FAKES3_SECRET_KEY=${secretKey}`,
        FAKES3_IMAGE,
      ],
      { stdio: 'inherit' },
    )
    if (started.status !== 0) fail('Could not start fakes3')
  }

  const origin = endpoint.replace(/\/+$/, '')
  await waitFor(`${origin}/`)
  // fakes3 starts empty and keeps nothing on disk, so create the bucket over
  // S3. curl signs the request (SigV4) since --auth rejects unsigned writes;
  // 409 BucketAlreadyOwnedByYou means a reused container already has it.
  const created = spawnSync(
    'curl',
    [
      '-sS',
      '-o',
      devNull,
      '-w',
      '%{http_code}',
      '-X',
      'PUT',
      '--aws-sigv4',
      'aws:amz:us-east-1:s3',
      '--user',
      `${accessKey}:${secretKey}`,
      `${origin}/${bucket}`,
    ],
    { encoding: 'utf8' },
  )
  if (created.error?.code === 'ENOENT') fail('curl is not installed.')
  if (!['200', '409'].includes(created.stdout)) {
    fail(`Could not create fakes3 bucket ${bucket} (HTTP ${created.stdout || '?'}): ${created.stderr.trim()}`)
  }
  process.stdout.write(`fakes3 ready at ${endpoint} (bucket ${bucket})\n`)
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
  await startFakes3()
}
