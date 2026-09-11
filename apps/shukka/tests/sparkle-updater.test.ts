import { generateKeyPairSync, sign, verify } from 'node:crypto'
import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const objects = new Map<string, string>()

vi.mock('~/lib/storage.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/storage.ts')>()
  return {
    ...actual,
    verifyWritable: vi.fn(async () => undefined),
    presignPut: vi.fn(async (_s3: unknown, key: string) => `https://storage.test/${key}?put`),
    presignGet: vi.fn(async (_s3: unknown, key: string) => `https://storage.test/${key}?get`),
    headObject: vi.fn(async (_s3: unknown, key: string) =>
      objects.has(key) ? { size: Buffer.byteLength(objects.get(key)!) } : null,
    ),
    getObjectText: vi.fn(async (_s3: unknown, key: string) => objects.get(key) ?? ''),
    deleteObjects: vi.fn(async (_s3: unknown, keys: string[]) => {
      for (const key of keys) objects.delete(key)
    }),
  }
})

const { db } = await import('~/db/index.ts')
const { apps } = await import('~/db/schema.ts')
const { clearObjectCache } = await import('~/lib/object-cache.ts')
const { parseAppcast } = await import('~/lib/appcast.ts')
const { createApp } = await import('~/server/apps.ts')
const { setCurrentVersion } = await import('~/server/channels.ts')
const { finalizeUpload, initUpload } = await import('~/server/releases.ts')
const { resolveFeedRequest } = await import('~/server/feed.ts')
const { sparkleAdapter } = await import('~/server/updaters/sparkle.ts')

const ORIGIN = 'https://updates.test'
const ZIP = 'App-1.4.2.zip'

const baseInput = {
  name: 'Acme',
  slug: 'acme',
  s3Endpoint: null,
  s3Region: 'us-east-1',
  s3Bucket: 'releases',
  s3Prefix: 'acme',
  s3AccessKeyId: 'key',
  s3SecretAccessKey: 'secret',
  s3ForcePathStyle: false,
  updaterKind: 'sparkle' as const,
}

function signBytes(body: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const signature = sign(null, Buffer.from(body), privateKey).toString('base64')
  return { signature, publicKey, body }
}

function sampleAppcast(args: {
  short?: string
  build?: string
  url?: string
  signature?: string
  length?: string
  extraItem?: boolean
}) {
  const short = args.short ?? '1.4.2'
  const build = args.build ?? short
  const url = args.url ?? `https://cdn.example/${ZIP}`
  const signature = args.signature ?? 'SIG'
  const length = args.length ?? '12'
  const extra = args.extraItem
    ? `
      <item>
        <sparkle:shortVersionString>9.9.9</sparkle:shortVersionString>
        <enclosure url="https://cdn.example/old.zip" sparkle:edSignature="OLD" length="1" type="application/octet-stream"/>
      </item>`
    : ''
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>Acme</title>
    <item>
      <title>Version ${short}</title>
      <sparkle:version>${build}</sparkle:version>
      <sparkle:shortVersionString>${short}</sparkle:shortVersionString>
      <enclosure url="${url}" sparkle:edSignature="${signature}" length="${length}" type="application/octet-stream"/>
    </item>${extra}
  </channel>
</rss>
`
}

async function publishSparkle(
  app: Awaited<ReturnType<typeof createApp>>,
  version: string,
  extras: { filename: string; body: string }[] = [],
  options: { release?: boolean } = {},
) {
  const files = [{ filename: ZIP }, { filename: `${ZIP}.sig` }, ...extras.map((file) => ({ filename: file.filename }))]
  const init = await initUpload(app, { channel: 'stable', version, files })
  for (const file of init.files) {
    const extra = extras.find((entry) => entry.filename === file.filename)
    objects.set(file.key, extra?.body ?? (file.filename.endsWith('.sig') ? 'SIGNATURE' : 'binary-zip'))
  }
  return finalizeUpload(app, init.uploadId, { release: options.release !== false })
}

beforeEach(() => {
  clearObjectCache()
})

describe('sparkle inferFeedTarget', () => {
  it('maps archives to macos and ignores metadata', () => {
    expect(sparkleAdapter.inferFeedTarget('App-1.4.2.zip')).toBe('macos')
    expect(sparkleAdapter.inferFeedTarget('App.dmg')).toBe('macos')
    expect(sparkleAdapter.inferFeedTarget('appcast.xml')).toBeNull()
    expect(sparkleAdapter.inferFeedTarget('App-1.4.2.zip.sig')).toBeNull()
  })
})

describe('updater kind sparkle', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('persists sparkle when requested', async () => {
    const app = await createApp(baseInput)
    expect(app.updaterKind).toBe('sparkle')
  })
})

describe('sparkle upload and feed', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('rejects a sparkle upload without appcast.xml or archive+.sig', async () => {
    const app = await createApp(baseInput)
    await expect(
      initUpload(app, { channel: 'stable', version: '1.0.0', files: [{ filename: ZIP }] }),
    ).rejects.toThrow(/appcast\.xml|\.sig/)
  })

  it('rejects a yml-only dump onto a sparkle app', async () => {
    const app = await createApp(baseInput)
    await expect(
      initUpload(app, { channel: 'stable', version: '1.0.0', files: [{ filename: 'latest.yml' }] }),
    ).rejects.toThrow(/appcast\.xml|\.sig/)
  })

  it('rejects appcast-only onto an electron app', async () => {
    const app = await createApp({ ...baseInput, updaterKind: undefined, slug: 'electron-acme' })
    await expect(
      initUpload(app, {
        channel: 'stable',
        version: '1.0.0',
        files: [{ filename: 'appcast.xml' }, { filename: ZIP }],
      }),
    ).rejects.toThrow(/yml/)
  })

  it('serves a one-item appcast at the channel root and appcast.xml', async () => {
    const app = await createApp(baseInput)
    await publishSparkle(app, '1.4.2')

    const root = await resolveFeedRequest('acme', 'stable', '', ORIGIN)
    const named = await resolveFeedRequest('acme', 'stable', 'appcast.xml', ORIGIN)
    expect(root).toMatchObject({ kind: 'document', contentType: 'application/xml; charset=utf-8' })
    expect(named).toEqual(root)

    const items = parseAppcast((root as { body: string }).body)
    expect(items).toHaveLength(1)
    expect(items[0]?.shortVersionString).toBe('1.4.2')
    expect(items[0]?.sparkleVersion).toBe('1.4.2')
    expect(items[0]?.enclosure.url).toBe(`${ORIGIN}/api/update/acme/stable/${encodeURIComponent(ZIP)}`)
    expect(items[0]?.enclosure.edSignature).toBe('SIGNATURE')
    expect(items[0]?.enclosure.length).toBe(String(Buffer.byteLength('binary-zip')))
  })

  it('rewrites uploaded appcast enclosure URLs and keeps signature + length', async () => {
    const app = await createApp(baseInput)
    await publishSparkle(app, '1.4.2', [
      {
        filename: 'appcast.xml',
        body: sampleAppcast({ short: '1.4.2', build: '142', signature: 'FROMCAST', length: '99' }),
      },
    ])

    const feed = await resolveFeedRequest('acme', 'stable', 'appcast.xml', ORIGIN)
    const items = parseAppcast((feed as { body: string }).body)
    expect(items).toHaveLength(1)
    expect(items[0]?.shortVersionString).toBe('1.4.2')
    expect(items[0]?.sparkleVersion).toBe('142')
    expect(items[0]?.enclosure.url).toBe(`${ORIGIN}/api/update/acme/stable/${encodeURIComponent(ZIP)}`)
    expect(items[0]?.enclosure.edSignature).toBe('FROMCAST')
    expect(items[0]?.enclosure.length).toBe('99')
  })

  it('rejects an appcast whose shortVersionString does not match the upload', async () => {
    const app = await createApp(baseInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'appcast.xml' }, { filename: ZIP }, { filename: `${ZIP}.sig` }],
    })
    for (const file of init.files) {
      objects.set(
        file.key,
        file.filename === 'appcast.xml' ? sampleAppcast({ short: '2.0.0' }) : file.filename.endsWith('.sig') ? 'SIG' : 'bin',
      )
    }
    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/declares version/)
  })

  it('rejects a multi-item appcast', async () => {
    const app = await createApp(baseInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.4.2',
      files: [{ filename: 'appcast.xml' }, { filename: ZIP }, { filename: `${ZIP}.sig` }],
    })
    for (const file of init.files) {
      objects.set(
        file.key,
        file.filename === 'appcast.xml'
          ? sampleAppcast({ extraItem: true })
          : file.filename.endsWith('.sig')
            ? 'SIG'
            : 'bin',
      )
    }
    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/exactly one/)
  })

  it('hides drafts on the public appcast and 302s a published archive', async () => {
    const app = await createApp(baseInput)
    await publishSparkle(app, '9.9.9', [], { release: false })

    await expect(resolveFeedRequest('acme', 'stable', '', ORIGIN)).rejects.toThrow(/no published version/)
    await expect(resolveFeedRequest('acme', 'stable', ZIP, ORIGIN)).rejects.toThrow(/no published version/)

    await publishSparkle(app, '1.0.0')
    const artifact = await resolveFeedRequest('acme', 'stable', ZIP, ORIGIN)
    expect(artifact).toMatchObject({ kind: 'redirect' })
  })

  it('rolls the appcast back to the older published version', async () => {
    const app = await createApp(baseInput)
    await publishSparkle(app, '1.0.0')
    await publishSparkle(app, '2.0.0', [], { release: true })

    let items = parseAppcast((await resolveFeedRequest('acme', 'stable', '', ORIGIN) as { body: string }).body)
    expect(items[0]?.shortVersionString).toBe('2.0.0')

    await setCurrentVersion(app.id, 'stable', '1.0.0')
    clearObjectCache()

    items = parseAppcast((await resolveFeedRequest('acme', 'stable', '', ORIGIN) as { body: string }).body)
    expect(items).toHaveLength(1)
    expect(items[0]?.shortVersionString).toBe('1.0.0')
    await expect(resolveFeedRequest('acme', 'stable', ZIP, ORIGIN)).resolves.toMatchObject({ kind: 'redirect' })
  })

  it('embeds an Ed25519 signature that verifies the enclosure bytes', async () => {
    const app = await createApp(baseInput)
    const { signature, publicKey, body } = signBytes('zip-bytes-for-eddsa')
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.4.2',
      files: [{ filename: ZIP }, { filename: `${ZIP}.sig` }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename.endsWith('.sig') ? signature : body)
    }
    await finalizeUpload(app, init.uploadId, { release: true })

    const feed = await resolveFeedRequest('acme', 'stable', 'appcast.xml', ORIGIN)
    const items = parseAppcast((feed as { body: string }).body)
    const edSignature = items[0]?.enclosure.edSignature ?? ''
    expect(
      verify(null, Buffer.from(body), publicKey, Buffer.from(edSignature, 'base64')),
    ).toBe(true)
  })
})
