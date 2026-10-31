#!/usr/bin/env node
// Starts the S3 backend selected by argv / S3_BACKEND (s3proxy | juicefs).
// s3proxy is a Docker S3 server with a filesystem backend; JuiceFS reuses
// apps/shukka/scripts/juicefs-dev.mjs (gateway).
//
// MinIO's published container images are no longer pullable anonymously
// (quay.io answers 401), so the Docker-facing CI paths run s3proxy instead.
// The non-Docker jobs (Windows / macOS runners) still use the MinIO binary
// via start-minio.mjs.
import { spawn, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BACKENDS = new Set(['s3proxy', 'juicefs'])
const backend = process.argv[2] ?? process.env.S3_BACKEND ?? 's3proxy'
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const endpoint = process.env.S3_URL ?? process.env.MINIO_URL ?? 'http://localhost:9000'
const accessKey = process.env.S3_ACCESS_KEY ?? process.env.MINIO_ACCESS_KEY ?? 'shukka'
const secretKey = process.env.S3_SECRET_KEY ?? process.env.MINIO_SECRET_KEY ?? 'shukkasecret'
const bucket = process.env.S3_BUCKET ?? process.env.MINIO_BUCKET ?? 'releases'

// Pinned by digest: s3proxy publishes no semver tags, and a tracked `master`
// would make CI drift without a commit.
const S3PROXY_IMAGE = 'andrewgaul/s3proxy@sha256:1f8915c2b4a8af22bf1fc191500f242974a458c457391b5788f9107544273dc3'

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

async function startS3proxy() {
  const existing = docker(['inspect', '--format', '{{.State.Status}}', 's3proxy'])
  if (existing.status === 0 && existing.stdout.trim() === 'running') {
    process.stdout.write('s3proxy container is already running\n')
  } else {
    process.stdout.write('Starting s3proxy\n')
    const started = docker(
      [
        'run',
        '-d',
        '--name',
        's3proxy',
        '-p',
        '9000:9000',
        '-e',
        'S3PROXY_ENDPOINT=http://0.0.0.0:9000',
        '-e',
        'S3PROXY_AUTHORIZATION=aws-v4',
        '-e',
        `S3PROXY_IDENTITY=${accessKey}`,
        '-e',
        `S3PROXY_CREDENTIAL=${secretKey}`,
        '-e',
        'JCLOUDS_PROVIDER=filesystem',
        '-e',
        'JCLOUDS_FILESYSTEM_BASEDIR=/data',
        S3PROXY_IMAGE,
      ],
      { stdio: 'inherit' },
    )
    if (started.status !== 0) fail('Could not start s3proxy')
  }

  await waitFor(`${endpoint.replace(/\/+$/, '')}/`)
  // The filesystem provider maps each bucket to a directory.
  const mkdir = docker(['exec', 's3proxy', 'mkdir', '-p', `/data/${bucket}`])
  if (mkdir.status !== 0) fail(`Could not create s3proxy bucket directory /data/${bucket}`)
  process.stdout.write(`s3proxy ready at ${endpoint} (bucket ${bucket})\n`)
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
  await startS3proxy()
}
