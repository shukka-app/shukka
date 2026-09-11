'use strict'

const { writeFileSync, mkdirSync } = require('node:fs')
const { createRequire } = require('node:module')
const { dirname, join } = require('node:path')
const { app } = require('electron')
const { autoUpdater } = createRequire(join(__dirname, '../package.json'))('electron-updater')

const resultPath = process.env.E2E_RESULT
const feedUrl = process.env.E2E_FEED_URL
const expectVersion = process.env.E2E_EXPECT_VERSION
const logs = []

function record(level, args) {
  const message = args.map((value) => (typeof value === 'string' ? value : String(value))).join(' ')
  logs.push({ level, message })
  const line = `[updater:${level}] ${message}\n`
  if (level === 'error') process.stderr.write(line)
  else process.stdout.write(line)
}

function finish(payload) {
  const body = { ...payload, logs, appVersion: app.getVersion(), platform: process.platform }
  if (resultPath) {
    mkdirSync(dirname(resultPath), { recursive: true })
    writeFileSync(resultPath, `${JSON.stringify(body, null, 2)}\n`)
  }
  app.exit(payload.ok ? 0 : 1)
}

if (!resultPath || !feedUrl) {
  process.stderr.write('E2E_RESULT and E2E_FEED_URL are required\n')
  process.exit(1)
}

if (process.env.E2E_USER_DATA) {
  app.setPath('userData', process.env.E2E_USER_DATA)
  app.setPath('sessionData', process.env.E2E_USER_DATA)
}

writeFileSync(
  join(__dirname, 'dev-app-update.yml'),
  `provider: generic\nurl: ${feedUrl}\nupdaterCacheDirName: shukka-e2e-app\n`,
)
if (process.platform === 'linux' && !process.env.APPIMAGE) {
  process.env.APPIMAGE = process.env.E2E_DUMMY_APPIMAGE
}

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('no-sandbox')
app.disableHardwareAcceleration()

app
  .whenReady()
  .then(async () => {
    autoUpdater.logger = {
      info: (...args) => record('info', args),
      warn: (...args) => record('warn', args),
      error: (...args) => record('error', args),
      debug: (...args) => record('debug', args),
    }
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.disableDifferentialDownload = true
    if ('autoInstallEvent' in autoUpdater) autoUpdater.autoInstallEvent = 'manual'

    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    record('info', [`app.version=${app.getVersion()} feed=${feedUrl}`])

    const check = await autoUpdater.checkForUpdates()
    const updateInfo = check?.updateInfo
    if (!updateInfo?.version) {
      finish({ ok: false, stage: 'check', error: 'checkForUpdates returned no updateInfo' })
      return
    }
    if (expectVersion && updateInfo.version !== expectVersion) {
      finish({
        ok: false,
        stage: 'check',
        error: `updater offered ${updateInfo.version}, expected ${expectVersion}`,
        version: updateInfo.version,
      })
      return
    }

    const files = await autoUpdater.downloadUpdate()
    finish({
      ok: true,
      stage: 'download',
      version: updateInfo.version,
      files: updateInfo.files,
      downloaded: files,
    })
  })
  .catch((error) => {
    finish({ ok: false, stage: 'run', error: error?.stack ?? String(error) })
  })
