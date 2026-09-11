import { describe, expect, it } from 'vitest'
import { isMetadataFile, parseUpdateMetadata, referencedArtifacts } from '~/lib/update-metadata.ts'
import { ShukkaError } from '~/lib/errors.ts'

const LATEST_YML = `version: 1.4.2
files:
  - url: Acme-Setup-1.4.2.exe
    sha512: abc==
    size: 1048576
  - url: Acme-Setup-1.4.2.exe.blockmap
    sha512: def==
    size: 2048
path: Acme-Setup-1.4.2.exe
sha512: abc==
releaseDate: '2026-01-05T10:00:00.000Z'
`

describe('update metadata', () => {
  it('treats every yml variant electron-builder emits as metadata', () => {
    for (const name of ['latest.yml', 'latest-mac.yml', 'latest-linux.yml', 'beta.yml', 'beta-mac.yml']) {
      expect(isMetadataFile(name)).toBe(true)
    }
    for (const name of ['Acme-Setup-1.4.2.exe', 'Acme.dmg', 'app.AppImage', 'Acme.exe.blockmap']) {
      expect(isMetadataFile(name)).toBe(false)
    }
  })

  it('reads the version and referenced artifacts', () => {
    const metadata = parseUpdateMetadata('latest.yml', LATEST_YML)
    expect(metadata.version).toBe('1.4.2')
    expect(referencedArtifacts(metadata)).toEqual(['Acme-Setup-1.4.2.exe', 'Acme-Setup-1.4.2.exe.blockmap'])
  })

  it('rejects documents without a version', () => {
    expect(() => parseUpdateMetadata('latest.yml', 'files: []')).toThrow(ShukkaError)
  })

  it('rejects malformed yaml', () => {
    expect(() => parseUpdateMetadata('latest.yml', '::: not yaml :::')).toThrow(ShukkaError)
  })
})
