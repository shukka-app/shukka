#!/usr/bin/env node
// Cloudflare Workers Free rejects a script over 3 MiB compressed.
// This matches `wrangler deploy --dry-run` "Total Upload … / gzip: …" — the
// number the API uses. `dist/client` static assets are not in that total.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LIMIT_BYTES = 3 * 1024 * 1024
const root = fileURLToPath(new URL('..', import.meta.url))
const wrangler = join(root, 'node_modules/.bin/wrangler')
const outdir = mkdtempSync(join(tmpdir(), 'shukka-worker-size-'))

const result = spawnSync(
  wrangler,
  ['deploy', '--dry-run', '--outdir', outdir],
  {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0' },
  },
)

rmSync(outdir, { recursive: true, force: true })

const output = `${result.stdout}\n${result.stderr}`
if (result.status !== 0) {
  process.stderr.write(output)
  process.exit(result.status === null ? 1 : result.status)
}

const match = output.match(/Total Upload:\s*[\d.]+\s*KiB\s*\/\s*gzip:\s*([\d.]+)\s*KiB/)
if (!match) {
  process.stderr.write('wrangler dry-run did not print a Total Upload gzip size\n')
  process.stderr.write(output)
  process.exit(1)
}

const gzipBytes = Math.round(Number(match[1]) * 1024)
const gzipKiB = gzipBytes / 1024
const limitKiB = LIMIT_BYTES / 1024
process.stdout.write(
  `Worker script gzip ${gzipKiB.toFixed(2)} KiB / ${limitKiB.toFixed(0)} KiB Cloudflare Free limit\n`,
)

if (gzipBytes > LIMIT_BYTES) {
  process.stderr.write(
    `Worker script gzip ${gzipBytes} bytes exceeds ${LIMIT_BYTES} bytes (3 MiB)\n`,
  )
  process.exit(1)
}
