/**
 * Writes a real Sparkle zip (Dummy.app) + matching .sig for the Action.
 * Signs with Node Ed25519 (same algorithm as Sparkle sign_update).
 *
 * On macOS, packs with `ditto -c -k` — the same tool Sparkle's unarchiver
 * uses to extract — so the archive is Apple-compatible. Elsewhere, writes an
 * uncompressed ZIP with Unix modes (Linux XML+EdDSA e2e / unit tests).
 *
 * Env: SHUKKA_DIRECTORY (default ./out), SHUKKA_VERSION (optional).
 * Writes GITHUB_OUTPUT: version, public-key, directory.
 */
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, sign } from 'node:crypto'
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_NAME = 'Dummy.app'
const BUNDLE_ID = 'app.shukka.sparkle-check'
const directory = resolve(process.env.SHUKKA_DIRECTORY || 'out')
const version = process.env.SHUKKA_VERSION || `2.0.${Date.now() % 100000}`
const zipName = `App-${version}.zip`

function crc32(data) {
  let crc = ~0
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return ~crc >>> 0
}

function externalAttrs(mode, isDir) {
  const unix = (mode << 16) >>> 0
  return isDir ? unix | 0x10 : unix
}

/** Uncompressed ZIP so Linux tests can assert a real Dummy.app archive. */
function zipStore(entries) {
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  const locals = []
  const centrals = []
  let offset = 0

  for (const { name, data, mode = 0o100644 } of entries) {
    const isDir = name.endsWith('/')
    const nameBuf = Buffer.from(name, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt16LE(dosTime, 10)
    local.writeUInt16LE(dosDate, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    const localFull = Buffer.concat([local, nameBuf, data])
    locals.push(localFull)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(0x0314, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(dosTime, 12)
    central.writeUInt16LE(dosDate, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(externalAttrs(mode, isDir), 38)
    central.writeUInt32LE(offset, 42)
    centrals.push(Buffer.concat([central, nameBuf]))
    offset += localFull.length
  }

  const centralDir = Buffer.concat(centrals)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralDir.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralDir, eocd])
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>${BUNDLE_ID}</string>
  <key>CFBundleName</key>
  <string>SparkleCheck</string>
  <key>CFBundleDisplayName</key>
  <string>SparkleCheck</string>
  <key>CFBundleExecutable</key>
  <string>Dummy</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleVersion</key>
  <string>${version}</string>
  <key>CFBundleShortVersionString</key>
  <string>${version}</string>
</dict>
</plist>
`

const binaryBytes = existsSync('/usr/bin/true')
  ? readFileSync('/usr/bin/true')
  : Buffer.from('#!/bin/sh\nexit 0\n')

function writeAppTree(appDir) {
  const macos = join(appDir, 'Contents', 'MacOS')
  mkdirSync(macos, { recursive: true })
  writeFileSync(join(appDir, 'Contents', 'Info.plist'), plist)
  writeFileSync(join(appDir, 'Contents', 'PkgInfo'), 'APPL????')
  const binary = join(macos, 'Dummy')
  writeFileSync(binary, binaryBytes)
  chmodSync(binary, 0o755)
}

function packWithDitto() {
  const scratch = mkdtempSync(join(tmpdir(), 'shukka-sparkle-'))
  try {
    writeAppTree(join(scratch, APP_NAME))
    const packed = spawnSync(
      'ditto',
      ['-c', '-k', '--keepParent', '--norsrc', '--noextattr', APP_NAME, zipName],
      { cwd: scratch, encoding: 'utf8' },
    )
    if (packed.status !== 0) {
      throw new Error(`ditto failed: ${(packed.stderr || packed.stdout || packed.status).toString().trim()}`)
    }
    return readFileSync(join(scratch, zipName))
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

function packStored() {
  const empty = Buffer.alloc(0)
  return zipStore([
    { name: `${APP_NAME}/`, data: empty, mode: 0o040755 },
    { name: `${APP_NAME}/Contents/`, data: empty, mode: 0o040755 },
    { name: `${APP_NAME}/Contents/MacOS/`, data: empty, mode: 0o040755 },
    { name: `${APP_NAME}/Contents/Info.plist`, data: Buffer.from(plist) },
    { name: `${APP_NAME}/Contents/MacOS/Dummy`, data: binaryBytes, mode: 0o100755 },
    { name: `${APP_NAME}/Contents/PkgInfo`, data: Buffer.from('APPL????') },
  ])
}

const zipBytes = process.platform === 'darwin' && existsSync('/usr/bin/ditto') ? packWithDitto() : packStored()

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const signature = sign(null, zipBytes, privateKey).toString('base64')
const pubDer = publicKey.export({ type: 'spki', format: 'der' })
const sparklePublicKey = pubDer.subarray(pubDer.length - 32).toString('base64')
const sidecar = `sparkle:edSignature="${signature}" length="${zipBytes.length}"\n`

mkdirSync(directory, { recursive: true })
writeFileSync(resolve(directory, zipName), zipBytes)
writeFileSync(resolve(directory, `${zipName}.sig`), sidecar)

process.stdout.write(`Prepared Sparkle ${version} in ${directory} (${zipName}, ${zipBytes.length} bytes)\n`)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\npublic-key=${sparklePublicKey}\ndirectory=${directory}\n`,
  )
} else {
  process.stdout.write(`public-key=${sparklePublicKey}\n`)
}
