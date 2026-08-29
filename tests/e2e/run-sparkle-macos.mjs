/**
 * macOS Sparkle.framework e2e: check + download, no install.
 *
 * Env: SHUKKA_URL, E2E_PUBLIC_KEY, E2E_VERSION, SHUKKA_APP (default demo-sparkle)
 * Optional: E2E_CHANNEL (default stable), SPARKLE_CHECK_TIMEOUT (default 90)
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  process.stderr.write('run-sparkle-macos.mjs requires macOS (Sparkle.framework)\n')
  process.exit(1)
}

const serverUrl = process.env.SHUKKA_URL || process.env.SHUKKA_SERVER_URL
const publicKey = process.env.E2E_PUBLIC_KEY
const version = process.env.E2E_VERSION
const appSlug = process.env.SHUKKA_APP ?? 'demo-sparkle'
const channel = process.env.E2E_CHANNEL ?? process.env.SHUKKA_CHANNEL ?? 'stable'
const timeout = process.env.SPARKLE_CHECK_TIMEOUT ?? '90'

if (!serverUrl || !publicKey || !version) {
  process.stderr.write('SHUKKA_URL, E2E_PUBLIC_KEY, and E2E_VERSION are required\n')
  process.exit(1)
}

const packageDir = join(fileURLToPath(new URL('.', import.meta.url)), 'sparkle-check')
const feed = `${serverUrl.replace(/\/+$/, '')}/api/update/${appSlug}/${channel}/appcast.xml`

process.stdout.write(`sparkle-check feed ${feed} expected ${version}\n`)

await new Promise((resolve, reject) => {
  const child = spawn(
    'swift',
    [
      'run',
      '--package-path',
      packageDir,
      'sparkle-check',
      '--feed',
      feed,
      '--public-key',
      publicKey,
      '--expected-version',
      version,
      '--timeout',
      timeout,
    ],
    { stdio: 'inherit' },
  )
  child.on('exit', (code) => {
    if (code === 0) resolve()
    else reject(new Error(`sparkle-check exited ${code}`))
  })
})
