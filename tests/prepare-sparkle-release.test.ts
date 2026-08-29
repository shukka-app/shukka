import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const prepare = fileURLToPath(new URL('../tests/e2e/prepare-sparkle-release.mjs', import.meta.url))

describe('prepare-sparkle-release', () => {
  it('writes a real Dummy.app zip plus a sign_update sidecar', () => {
    const directory = mkdtempSync(join(tmpdir(), 'shukka-sparkle-prep-'))
    const output = execFileSync(process.execPath, [prepare], {
      env: { ...process.env, SHUKKA_DIRECTORY: directory, SHUKKA_VERSION: '2.0.99' },
      encoding: 'utf8',
    })
    expect(output).toMatch(/Prepared Sparkle 2\.0\.99/)

    const names = readdirSync(directory).sort()
    expect(names).toEqual(['App-2.0.99.zip', 'App-2.0.99.zip.sig'])

    const zip = readFileSync(join(directory, 'App-2.0.99.zip'))
    expect(zip.subarray(0, 4).equals(Buffer.from('PK\x03\x04'))).toBe(true)
    expect(zip.includes(Buffer.from('Dummy.app/Contents/Info.plist'))).toBe(true)
    expect(zip.includes(Buffer.from('CFBundleIdentifier'))).toBe(true)
    expect(zip.includes(Buffer.from('app.shukka.sparkle-check'))).toBe(true)
    expect(zip.includes(Buffer.from('SUPublicEDKey'))).toBe(true)

    const sidecar = readFileSync(join(directory, 'App-2.0.99.zip.sig'), 'utf8')
    expect(sidecar).toMatch(/^sparkle:edSignature="[A-Za-z0-9+/=]+" length="\d+"/)
    expect(sidecar).toContain(`length="${zip.length}"`)
  })
})
