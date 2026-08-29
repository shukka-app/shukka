/**
 * Live Sparkle feed e2e against a running Shukka.
 *
 * Linux / this script: publish a signed zip, GET the one-item appcast, follow
 * the enclosure 302, verify Ed25519. No Sparkle.framework (macOS-only).
 *
 * Env: SHUKKA_URL, SHUKKA_API_KEY, SHUKKA_APP (optional, default demo-sparkle)
 */
import { generateKeyPairSync, sign, verify } from 'node:crypto'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(fileURLToPath(new URL('../..', import.meta.url)))
const serverUrl = process.env.SHUKKA_URL || process.env.SHUKKA_SERVER_URL
const apiKey = process.env.SHUKKA_API_KEY
const appSlug = process.env.SHUKKA_APP ?? 'demo-sparkle'

if (!serverUrl || !apiKey) {
  process.stderr.write('SHUKKA_URL and SHUKKA_API_KEY are required\n')
  process.exit(1)
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const body = 'sparkle-e2e-zip-bytes'
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const signature = sign(null, Buffer.from(body), privateKey).toString('base64')
const version = `1.0.${Date.now() % 100000}`
const zipName = `App-${version}.zip`

const directory = await mkdtemp(join(tmpdir(), 'shukka-sparkle-e2e-'))
await writeFile(join(directory, zipName), body)
await writeFile(join(directory, `${zipName}.sig`), signature)

const { spawn } = await import('node:child_process')
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [join(repoRoot, 'scripts/shukka-upload.mjs')], {
    env: {
      ...process.env,
      SHUKKA_SERVER_URL: serverUrl,
      SHUKKA_API_KEY: apiKey,
      SHUKKA_APP: appSlug,
      SHUKKA_CHANNEL: 'stable',
      SHUKKA_DIRECTORY: directory,
      SHUKKA_VERSION: version,
      SHUKKA_UPDATER_KIND: 'sparkle',
      SHUKKA_RELEASE: 'true',
    },
    stdio: 'inherit',
  })
  child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`upload exited ${code}`))))
})

const appcastUrl = `${serverUrl.replace(/\/+$/, '')}/api/update/${appSlug}/stable/appcast.xml`
const response = await fetch(appcastUrl)
if (!response.ok) fail(`appcast ${response.status}`)
const xml = await response.text()
if (!xml.includes('<item>')) fail('appcast has no item')
if ((xml.match(/<item>/g) ?? []).length !== 1) fail('appcast is not one item')
const sig = xml.match(/sparkle:edSignature="([^"]+)"/)?.[1]
const enclosure = xml.match(/url="([^"]+)"/)?.[1]
if (!sig || !enclosure) fail('appcast missing enclosure or signature')
if (!verify(null, Buffer.from(body), publicKey, Buffer.from(sig, 'base64'))) {
  fail('sparkle:edSignature does not verify the archive bytes')
}

const download = await fetch(enclosure, { redirect: 'follow' })
if (!download.ok) fail(`enclosure download ${download.status}`)
const downloaded = await download.text()
if (downloaded !== body) fail('enclosure bytes do not match the published archive')

process.stdout.write(`sparkle e2e ok: ${version} one-item appcast, 302, EdDSA verified\n`)
