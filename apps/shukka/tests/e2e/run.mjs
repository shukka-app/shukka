#!/usr/bin/env node
/**
 * Host-platform electron-updater e2e against a live Shukka feed.
 *
 * Requires SHUKKA_URL. Unless E2E_SKIP_PUBLISH=1, also needs SHUKKA_API_KEY
 * and will upload a fake electron-builder directory (release, then a draft).
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../..')
const repoRoot = resolve(appRoot, '../..')
const require = createRequire(import.meta.url)
const electronPath = require('electron')

const serverUrl = required('SHUKKA_URL', process.env.SHUKKA_URL).replace(/\/+$/, '')
const appSlug = process.env.SHUKKA_APP ?? 'demo-app'
const channel = process.env.SHUKKA_CHANNEL ?? 'stable'
const feedUrl = `${serverUrl}/api/update/${appSlug}/${channel}`
const skipPublish = process.env.E2E_SKIP_PUBLISH === '1'
const liveVersion = process.env.E2E_VERSION ?? '1.2.0'
const draftVersion = process.env.E2E_DRAFT_VERSION ?? '9.9.9'

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

async function publish(directory, version, release) {
  await run(process.execPath, [join(repoRoot, '.github/scripts/fake-release.mjs'), directory, version])
  await run(process.execPath, [join(appRoot, 'scripts/shukka-upload.mjs')], {
    env: {
      ...process.env,
      SHUKKA_SERVER_URL: serverUrl,
      SHUKKA_API_KEY: required('SHUKKA_API_KEY', process.env.SHUKKA_API_KEY),
      SHUKKA_APP: appSlug,
      SHUKKA_CHANNEL: channel,
      SHUKKA_DIRECTORY: directory,
      SHUKKA_VERSION: version,
      SHUKKA_RELEASE: release ? 'true' : 'false',
    },
  })
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

const workRoot = await mkdtemp(join(tmpdir(), 'shukka-e2e-'))
try {
  if (!skipPublish) {
    await publish(join(workRoot, 'live'), liveVersion, true)
  }

  await launchUpdater({ expectVersion: liveVersion, workDir: join(workRoot, 'check-live') })

  await publish(join(workRoot, 'draft'), draftVersion, false)
  await launchUpdater({ expectVersion: liveVersion, workDir: join(workRoot, 'check-draft') })

  process.stdout.write(`e2e ok: live ${liveVersion} visible, draft ${draftVersion} hidden\n`)
} finally {
  await rm(workRoot, { recursive: true, force: true })
}
