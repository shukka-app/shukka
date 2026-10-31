import { describe, expect, it } from 'vitest'

const { sdkAdapter } = await import('~/server/updaters/sdk.ts')

describe('sdk adapter', () => {
  it('treats every file as an artifact — nothing is metadata or parsed', () => {
    expect(sdkAdapter.isMetadataFile('latest.yml')).toBe(false)
    expect(sdkAdapter.isMetadataFile('appcast.xml')).toBe(false)
    expect(sdkAdapter.isMetadataFile('latest.json')).toBe(false)
    expect(sdkAdapter.inferFeedTarget('App-1.4.2.dmg')).toBeNull()
    expect(sdkAdapter.parseMetadata('latest.yml', 'version: 9.9.9\n')).toEqual({ version: '', referenced: [] })
  })

  it('requires no metadata — an empty upload is rejected by initUpload, not the adapter', () => {
    expect(sdkAdapter.hasRequiredMetadata(['App-1.4.2.dmg'])).toBe(true)
    expect(sdkAdapter.hasRequiredMetadata([])).toBe(true)
  })

  it('infers platforms from installer extensions', () => {
    expect(
      sdkAdapter.platformsOf([
        { filename: 'App-1.4.2.dmg', kind: 'artifact' },
        { filename: 'App-1.4.2.exe', kind: 'artifact' },
        { filename: 'App-1.4.2.AppImage', kind: 'artifact' },
        { filename: 'checksums.txt', kind: 'artifact' },
      ]),
    ).toEqual(['macOS', 'Windows', 'Linux'])
  })
})
