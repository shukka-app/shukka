#!/usr/bin/env node
/**
 * Host-platform rollback e2e against a live Shukka feed.
 *
 * Publishes two releases, PATCHes currentVersion back to the older one, then
 * asserts the feed and electron-updater follow the pointer. The newer release
 * stays downloadable by filename.
 *
 * Requires SHUKKA_URL and SHUKKA_API_KEY. Versions default to a unique pair
 * above the e2e client's 1.0.0 so updater will offer both, then the rollback.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')
const require = createRequire(import.meta.url)
const electronPath = require('electron')

const serverUrl = required('SHUKKA_URL', process.env.SHUKKA_URL).replace(/\/+$/, '')
const apiKey = required('SHUKKA_API_KEY', process.env.SHUKKA_API_KEY)
const appSlug = process.env.SHUKKA_APP ?? 'demo-app'
const channel = process.env.SHUKKA_CHANNEL ?? 'stable'
const feedUrl = `${serverUrl}/api/update/${appSlug}/${channel}`
const stamp = semverPatchStamp(process.env.E2E_VERSION_STAMP)
const olderVersion = process.env.E2E_FROM_VERSION ?? `1.2.${stamp}`
const newerVersion = process.env.E2E_TO_VERSION ?? `2.0.${stamp}`

/** Keep in sync with tests/semver-stamp.ts — this script is plain Node. */
function semverPatchStamp(raw = String((Date.now() % 900_000) + 100_000)) {
  const n = Number.parseInt(String(raw), 10)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`E2E_VERSION_STAMP must be a positive integer, got ${JSON.stringify(raw)}`)
  }
  return String(n)
}

function required(name, value) {
  if (!value) {
    process.stderr.write(`Missing ${name}\n`)
    process.exit(1)
  }
  return value
}

function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120_000
  const { timeoutMs: _ignored, ...spawnOptions } = options
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...spawnOptions })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise()
      else reject(new Error(`${command} exited ${code ?? signal}`))
    })
  })
}

async function publish(directory, version) {
  await run(process.execPath, [join(repoRoot, '.github/scripts/fake-release.mjs'), directory, version])
  await run(process.execPath, [join(repoRoot, 'scripts/shukka-upload.mjs')], {
    env: {
      ...process.env,
      SHUKKA_SERVER_URL: serverUrl,
      SHUKKA_API_KEY: apiKey,
      SHUKKA_APP: appSlug,
      SHUKKA_CHANNEL: channel,
      SHUKKA_DIRECTORY: directory,
      SHUKKA_VERSION: version,
      SHUKKA_RELEASE: 'true',
    },
  })
}

async function verifyFeed(version) {
  await run(process.execPath, [join(repoRoot, '.github/scripts/verify-feed.mjs'), feedUrl, version])
}

async function artifactUrlFromYml(directory) {
  const body = await readFile(join(directory, 'latest.yml'), 'utf8')
  const filename = body.match(/^\s+- url:\s*(.+)$/m)?.[1]?.trim()
  if (!filename) throw new Error(`latest.yml in ${directory} lists no artifact url`)
  return filename
}

async function assertArtifactRedirect(filename) {
  const response = await fetch(`${feedUrl}/${filename}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status !== 302) {
    throw new Error(`Artifact ${filename} returned ${response.status}, expected 302 after rollback`)
  }
  if (!response.headers.get('location')) {
    throw new Error(`Artifact ${filename} 302 had no Location header`)
  }
  process.stdout.write(`rolled-off ${filename} still 302\n`)
}

async function rollback(version) {
  const response = await fetch(`${serverUrl}/api/v1/apps/${appSlug}/channels/${channel}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ currentVersion: version }),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`PATCH currentVersion=${version} failed (${response.status}): ${text}`)
  }
  process.stdout.write(`rolled currentVersion back to ${version}\n`)
}

async function launchUpdater({ expectVersion, workDir }) {
  const userData = join(workDir, 'user-data')
  const dummyAppImage = join(workDir, 'current.AppImage')
  const resultPath = join(workDir, 'result.json')
  await mkdir(userData, { recursive: true })
  await writeFile(dummyAppImage, 'placeholder-appimage\n')

  await run(electronPath, [join(here, 'client')], {
    env: {
      ...process.env,
      E2E_FEED_URL: feedUrl,
      E2E_EXPECT_VERSION: expectVersion,
      E2E_RESULT: resultPath,
      E2E_USER_DATA: userData,
      E2E_DUMMY_APPIMAGE: dummyAppImage,
      ELECTRON_ENABLE_LOGGING: '1',
    },
  })

  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  if (!result.ok) {
    throw new Error(`updater failed at ${result.stage}: ${result.error}`)
  }
  if (result.version !== expectVersion) {
    throw new Error(`updater version ${result.version}, expected ${expectVersion}`)
  }
  process.stdout.write(`electron-updater ${result.platform} downloaded ${result.version}\n`)
  return result
}

const workRoot = await mkdtemp(join(tmpdir(), 'shukka-rollback-e2e-'))
try {
  const olderDir = join(workRoot, 'older')
  const newerDir = join(workRoot, 'newer')

  await publish(olderDir, olderVersion)
  await verifyFeed(olderVersion)

  await publish(newerDir, newerVersion)
  await verifyFeed(newerVersion)
  const leftoverArtifact = await artifactUrlFromYml(newerDir)
  await launchUpdater({ expectVersion: newerVersion, workDir: join(workRoot, 'check-newer') })

  await rollback(olderVersion)
  await verifyFeed(olderVersion)
  await assertArtifactRedirect(leftoverArtifact)
  await launchUpdater({ expectVersion: olderVersion, workDir: join(workRoot, 'check-rollback') })

  process.stdout.write(`e2e ok: rolled ${newerVersion} back to ${olderVersion}; leftover ${leftoverArtifact} still 302\n`)
} finally {
  await rm(workRoot, { recursive: true, force: true })
}
