import { load } from 'cheerio'
import { ShukkaError } from './errors.ts'
import { isSparkleArchive, isSparkleMetadataFile } from './sparkle-files.ts'

export { isSparkleArchive, isSparkleMetadataFile }

const SPARKLE_NS = 'http://www.andymatuschak.org/xml-namespaces/sparkle'

export type SparkleItem = {
  /** CFBundleVersion-style build, may differ from the marketing version. */
  sparkleVersion: string
  shortVersionString: string
  title: string
  description: string
  minimumSystemVersion: string
  enclosure: {
    url: string
    filename: string
    edSignature: string
    length: string
    type: string
  }
}

/** Marketing version when Sparkle provides one; otherwise the build version. */
export function declaredSparkleVersion(item: Pick<SparkleItem, 'sparkleVersion' | 'shortVersionString'>): string {
  return item.shortVersionString || item.sparkleVersion
}

export function enclosureFilename(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)
  } catch {
    return decodeURIComponent(url.split('/').pop() ?? url)
  }
}

/**
 * `sign_update` writes either a raw EdDSA blob or
 * `sparkle:edSignature="…" length="…"`.
 */
export function parseSignUpdateSidecar(text: string): { edSignature: string; length: string } {
  const trimmed = text.trim()
  const attr = /sparkle:edSignature="([^"]+)"/.exec(trimmed)
  const length = /(?:^|\s)length="(\d+)"/.exec(trimmed)
  if (attr) return { edSignature: attr[1], length: length?.[1] ?? '' }
  const first = trimmed.split(/\s+/)[0] ?? ''
  return { edSignature: first, length: length?.[1] ?? '' }
}

function localName(tag: string): string {
  const colon = tag.lastIndexOf(':')
  return colon === -1 ? tag.toLowerCase() : tag.slice(colon + 1).toLowerCase()
}

function textOf($: ReturnType<typeof load>, node: ReturnType<ReturnType<typeof load>>, local: string): string {
  const want = local.toLowerCase()
  let found = ''
  node.children().each((_, el) => {
    if (el.type !== 'tag') return
    if (localName(el.name) === want) found = $(el).text().trim()
  })
  return found
}

function attrOf(enclosure: { attribs?: Record<string, string> } | undefined, local: string): string {
  if (!enclosure?.attribs) return ''
  const direct = enclosure.attribs[local] ?? enclosure.attribs[`sparkle:${local}`]
  if (direct) return direct
  const suffix = `:${local}`
  for (const [key, value] of Object.entries(enclosure.attribs)) {
    if (key === local || key.endsWith(suffix)) return value
  }
  return ''
}

export function parseAppcast(text: string): SparkleItem[] {
  let $: ReturnType<typeof load>
  try {
    $ = load(text, { xml: true })
  } catch (error) {
    throw new ShukkaError('metadata_error', 'appcast.xml is not valid XML', String(error))
  }

  const items: SparkleItem[] = []
  $('item').each((_, el) => {
    const node = $(el)
    const enclosureEl = node.find('enclosure').get(0)
    const url = attrOf(enclosureEl, 'url')
    const filename = url ? enclosureFilename(url) : ''
    items.push({
      sparkleVersion: textOf($, node, 'version') || attrOf(enclosureEl, 'version'),
      shortVersionString:
        textOf($, node, 'shortVersionString') || attrOf(enclosureEl, 'shortVersionString'),
      title: node.find('title').first().text().trim(),
      description: node.find('description').first().text().trim(),
      minimumSystemVersion: textOf($, node, 'minimumSystemVersion'),
      enclosure: {
        url,
        filename,
        edSignature: attrOf(enclosureEl, 'edSignature'),
        length: attrOf(enclosureEl, 'length'),
        type: attrOf(enclosureEl, 'type') || 'application/octet-stream',
      },
    })
  })
  return items
}

export function parseAppcastMetadata(text: string): { version: string; referenced: string[] } {
  const items = parseAppcast(text)
  if (items.length === 0) {
    throw new ShukkaError('metadata_error', 'appcast.xml must contain exactly one <item>')
  }
  if (items.length > 1) {
    throw new ShukkaError(
      'metadata_error',
      'appcast.xml must contain exactly one <item> (Shukka serves the current version only)',
    )
  }
  const [item] = items
  const version = declaredSparkleVersion(item)
  if (!version) {
    throw new ShukkaError(
      'metadata_error',
      'appcast.xml item needs sparkle:shortVersionString or sparkle:version',
    )
  }
  if (!item.enclosure.filename) {
    throw new ShukkaError('metadata_error', 'appcast.xml item is missing an enclosure url')
  }
  return { version, referenced: [item.enclosure.filename] }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function cdata(value: string): string {
  return `<![CDATA[${value.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`
}

export function generateAppcast(args: {
  title: string
  version: string
  sparkleVersion: string
  shortVersionString: string
  releasedAt: number
  enclosureUrl: string
  edSignature: string
  length: string
  description?: string
  minimumSystemVersion?: string
}): string {
  const pubDate = new Date(args.releasedAt * 1000).toUTCString()
  const description = args.description
    ? `\n      <description>${cdata(args.description)}</description>`
    : ''
  const minOs = args.minimumSystemVersion
    ? `\n      <sparkle:minimumSystemVersion>${escapeXml(args.minimumSystemVersion)}</sparkle:minimumSystemVersion>`
    : ''

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="${SPARKLE_NS}">
  <channel>
    <title>${escapeXml(args.title)}</title>
    <item>
      <title>${escapeXml(args.title)}</title>
      <pubDate>${escapeXml(pubDate)}</pubDate>
      <sparkle:version>${escapeXml(args.sparkleVersion)}</sparkle:version>
      <sparkle:shortVersionString>${escapeXml(args.shortVersionString)}</sparkle:shortVersionString>${minOs}${description}
      <enclosure url="${escapeXml(args.enclosureUrl)}" sparkle:edSignature="${escapeXml(args.edSignature)}" length="${escapeXml(args.length)}" type="application/octet-stream"/>
    </item>
  </channel>
</rss>
`
}
