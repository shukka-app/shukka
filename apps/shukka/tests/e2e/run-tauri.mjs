#!/usr/bin/env node
/**
 * Host-platform Tauri plugin-updater e2e against a live Shukka feed.
 *
 * Requires SHUKKA_URL. Unless E2E_SKIP_PUBLISH=1, also needs SHUKKA_API_KEY
 * and will upload a fake Tauri updater directory (release, then a draft).
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '../..')
const repoRoot = resolve(appRoot, '../..')
const tauriDir = join(here, 'tauri-app/src-tauri')

const serverUrl = required('SHUKKA_URL', process.env.SHUKKA_URL).replace(/\/+$/, '')
const appSlug = process.env.SHUKKA_APP ?? 'demo-tauri'
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
  const timeoutMs = options.timeoutMs ?? 180_000
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

async function generateKeys(workDir) {
  const keyPath = join(workDir, 'e2e.key')
  await run('npx', ['--yes', '@tauri-apps/cli@2', 'signer', 'generate', '-w', keyPath, '--ci', '--password', ''], {
    cwd: workDir,
  })
  const pubkey = (await readFile(`${keyPath}.pub`, 'utf8')).trim()
  if (!pubkey) throw new Error('tauri signer generate wrote an empty public key')
  return { keyPath, pubkey }
}

async function signDirectory(directory, keyPath) {
  const secret = (await readFile(keyPath, 'utf8')).trim()
  const names = await readdir(directory)
  for (const name of names) {
    if (name.endsWith('.sig')) continue
    await run(
      'npx',
      [
        '--yes',
        '@tauri-apps/cli@2',
        'signer',
        'sign',
        '--private-key',
        secret,
        '--password',
        '',
        join(directory, name),
      ],
    )
  }
}

async function publish(directory, version, release, keyPath) {
  await run(process.execPath, [join(repoRoot, '.github/scripts/fake-tauri-release.mjs'), directory, version])
  await signDirectory(directory, keyPath)
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

async function launchUpdater({ expectVersion, workDir, pubkey }) {
  const resultPath = join(workDir, 'result.json')
  await mkdir(workDir, { recursive: true })
  await run('cargo', ['run', '--quiet', '--offline'], {
    cwd: tauriDir,
    timeoutMs: 180_000,
    env: {
      ...process.env,
      E2E_FEED_URL: feedUrl,
      E2E_EXPECT_VERSION: expectVersion,
      E2E_RESULT: resultPath,
      E2E_PUBKEY: pubkey,
      CARGO_TERM_COLOR: 'always',
    },
  })

  const result = JSON.parse(await readFile(resultPath, 'utf8'))
  if (!result.ok) {
    throw new Error(`updater failed at ${result.stage}: ${result.error}`)
  }
  if (result.version !== expectVersion) {
    throw new Error(`updater version ${result.version}, expected ${expectVersion}`)
  }
  process.stdout.write(`plugin-updater ${result.target} downloaded ${result.version} (${result.bytes} bytes)\n`)
  return result
}

const workRoot = await mkdtemp(join(tmpdir(), 'shukka-tauri-e2e-'))
try {
  let pubkey = process.env.E2E_PUBKEY
  let keyPath = process.env.TAURI_SIGNING_PRIVATE_KEY
  if (!skipPublish || !pubkey) {
    const keys = await generateKeys(workRoot)
    pubkey = keys.pubkey
    keyPath = keys.keyPath
    await writeFile(join(workRoot, 'pubkey.txt'), `${pubkey}\n`)
  }

  // generate_context! refuses to compile if frontendDist is missing. The app
  // is headless; the stub is only there so the proc macro can resolve the path.
  // Root .gitignore lists `dist`, so this directory cannot be named that.
  const frontendDist = join(here, 'tauri-app/frontend')
  await mkdir(frontendDist, { recursive: true })
  await writeFile(join(frontendDist, 'index.html'), '<!doctype html><title>shukka-e2e</title>\n')

  process.stdout.write('Building Tauri e2e client (first cargo run may take a few minutes)\n')
  await run('cargo', ['build', '--offline'], {
    cwd: tauriDir,
    timeoutMs: 600_000,
  }).catch(async () => {
    await run('cargo', ['build'], { cwd: tauriDir, timeoutMs: 600_000 })
  })

  if (!skipPublish) {
    await publish(join(workRoot, 'live'), liveVersion, true, keyPath)
  }

  await launchUpdater({ expectVersion: liveVersion, workDir: join(workRoot, 'check-live'), pubkey })

  await publish(join(workRoot, 'draft'), draftVersion, false, keyPath)
  await launchUpdater({ expectVersion: liveVersion, workDir: join(workRoot, 'check-draft'), pubkey })

  process.stdout.write(`tauri e2e ok: live ${liveVersion} visible, draft ${draftVersion} hidden\n`)
} finally {
  await rm(workRoot, { recursive: true, force: true })
}
