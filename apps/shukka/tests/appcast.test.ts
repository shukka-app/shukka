import { describe, expect, it } from 'vitest'
import {
  declaredSparkleVersion,
  generateAppcast,
  parseAppcast,
  parseAppcastMetadata,
  parseSignUpdateSidecar,
} from '~/lib/appcast.ts'

const ONE_ITEM = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <item>
      <sparkle:version>142</sparkle:version>
      <sparkle:shortVersionString>1.4.2</sparkle:shortVersionString>
      <enclosure url="https://cdn.example/App-1.4.2.zip" sparkle:edSignature="abc" length="99" type="application/octet-stream"/>
    </item>
  </channel>
</rss>
`

describe('parseAppcast', () => {
  it('reads element versions and enclosure attributes', () => {
    const [item] = parseAppcast(ONE_ITEM)
    expect(item?.sparkleVersion).toBe('142')
    expect(item?.shortVersionString).toBe('1.4.2')
    expect(item?.enclosure.filename).toBe('App-1.4.2.zip')
    expect(item?.enclosure.edSignature).toBe('abc')
    expect(item?.enclosure.length).toBe('99')
    expect(declaredSparkleVersion(item!)).toBe('1.4.2')
  })

  it('reads versions from enclosure attributes when elements are absent', () => {
    const xml = `<rss xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><item>
      <enclosure url="App.zip" sparkle:version="3" sparkle:shortVersionString="1.0.0" sparkle:edSignature="x" length="1"/>
    </item></channel></rss>`
    const [item] = parseAppcast(xml)
    expect(declaredSparkleVersion(item!)).toBe('1.0.0')
    expect(item?.sparkleVersion).toBe('3')
  })

  it('rejects zero or many items', () => {
    expect(() => parseAppcastMetadata('<rss><channel></channel></rss>')).toThrow(/exactly one/)
    expect(() =>
      parseAppcastMetadata(`${ONE_ITEM.replace('</channel>', '<item><enclosure url="b.zip"/></item></channel>')}`),
    ).toThrow(/exactly one/)
  })
})

describe('parseSignUpdateSidecar', () => {
  it('reads sign_update attribute output and raw signatures', () => {
    expect(parseSignUpdateSidecar('sparkle:edSignature="AAA" length="12"')).toEqual({
      edSignature: 'AAA',
      length: '12',
    })
    expect(parseSignUpdateSidecar('  BBB==  \n')).toEqual({ edSignature: 'BBB==', length: '' })
  })
})

describe('generateAppcast', () => {
  it('emits one item that parseAppcast can read back', () => {
    const xml = generateAppcast({
      title: 'Version 1.4.2',
      version: '1.4.2',
      sparkleVersion: '142',
      shortVersionString: '1.4.2',
      releasedAt: 1_700_000_000,
      enclosureUrl: 'https://updates.test/api/update/acme/stable/App.zip',
      edSignature: 'SIG',
      length: '10',
    })
    const items = parseAppcast(xml)
    expect(items).toHaveLength(1)
    expect(items[0]?.sparkleVersion).toBe('142')
    expect(items[0]?.enclosure.edSignature).toBe('SIG')
  })
})
