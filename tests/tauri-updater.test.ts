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
const { createApp } = await import('~/server/apps.ts')
const { finalizeUpload, initUpload } = await import('~/server/releases.ts')
const { resolveFeedRequest } = await import('~/server/feed.ts')
const { tauriAdapter } = await import('~/server/updaters/tauri.ts')

const ORIGIN = 'https://updates.test'
const BUNDLE = 'app-aarch64.app.tar.gz'

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
}

async function publishTauri(
  app: Awaited<ReturnType<typeof createApp>>,
  version: string,
  extras: { filename: string; body: string }[] = [],
) {
  const files = [{ filename: BUNDLE }, { filename: `${BUNDLE}.sig` }, ...extras.map((file) => ({ filename: file.filename }))]
  const init = await initUpload(app, { channel: 'stable', version, files })
  for (const file of init.files) {
    const extra = extras.find((entry) => entry.filename === file.filename)
    objects.set(file.key, extra?.body ?? (file.filename.endsWith('.sig') ? 'SIGNATURE' : 'binary'))
  }
  return finalizeUpload(app, init.uploadId, { release: true })
}

beforeEach(() => {
  clearObjectCache()
})

describe('updater kind on create', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('defaults to electron when omitted', async () => {
    const app = await createApp(baseInput)
    expect(app.updaterKind).toBe('electron')
  })

  it('persists tauri when requested', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    expect(app.updaterKind).toBe('tauri')
  })
})

describe('tauri upload and feed', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('rejects a tauri upload without latest.json or .sig pairs', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    await expect(
      initUpload(app, { channel: 'stable', version: '1.0.0', files: [{ filename: BUNDLE }] }),
    ).rejects.toThrow(/latest.json|\.sig/)
  })

  it('serves static platforms JSON at the channel root and latest.json', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    await publishTauri(app, '1.4.2')

    const root = await resolveFeedRequest('acme', 'stable', '', ORIGIN)
    const named = await resolveFeedRequest('acme', 'stable', 'latest.json', ORIGIN)
    expect(root).toMatchObject({ kind: 'document', contentType: 'application/json; charset=utf-8' })
    expect(named).toEqual(root)

    const body = JSON.parse((root as { body: string }).body)
    expect(body.version).toBe('1.4.2')
    expect(body.platforms['darwin-aarch64']).toEqual({
      url: `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(BUNDLE)}`,
      signature: 'SIGNATURE',
    })
  })

  it('rewrites latest.json urls to this feed and inlines .sig contents', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    await publishTauri(app, '1.4.2', [
      {
        filename: 'latest.json',
        body: JSON.stringify({
          version: '1.4.2',
          platforms: {
            'darwin-aarch64': { url: `https://cdn.example/${BUNDLE}`, signature: '' },
          },
        }),
      },
    ])

    const feed = await resolveFeedRequest('acme', 'stable', 'latest.json', ORIGIN)
    const body = JSON.parse((feed as { body: string }).body)
    expect(body.platforms['darwin-aarch64'].url).toBe(
      `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(BUNDLE)}`,
    )
    expect(body.platforms['darwin-aarch64'].signature).toBe('SIGNATURE')
  })

  it('302s a published artifact and hides drafts', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    const init = await initUpload(app, {
      channel: 'stable',
      version: '9.9.9',
      files: [{ filename: BUNDLE }, { filename: `${BUNDLE}.sig` }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename.endsWith('.sig') ? 'SIGNATURE' : 'binary')
    }
    await finalizeUpload(app, init.uploadId)

    await expect(resolveFeedRequest('acme', 'stable', '', ORIGIN)).rejects.toThrow(/no published version/)
    await expect(resolveFeedRequest('acme', 'stable', BUNDLE, ORIGIN)).rejects.toThrow(/no published version/)

    await publishTauri(app, '1.0.0')
    const artifact = await resolveFeedRequest('acme', 'stable', BUNDLE, ORIGIN)
    expect(artifact).toMatchObject({ kind: 'redirect' })
  })

  it('does not throw when latest.json platform urls have malformed percent-encoding', async () => {
    const text = JSON.stringify({
      version: '1.4.2',
      platforms: {
        'darwin-aarch64': { url: `https://cdn.example/${BUNDLE}`, signature: 'SIG' },
        'windows-x86_64': { url: 'https://cdn.example/app%zz.exe', signature: 'SIG' },
      },
    })
    expect(() => tauriAdapter.parseMetadata('latest.json', text)).not.toThrow()

    const doc = await tauriAdapter.generateFeedDocument!({
      filename: 'latest.json',
      origin: ORIGIN,
      appSlug: 'acme',
      channelName: 'stable',
      releasedAt: 1,
      version: '1.4.2',
      artifacts: [
        { filename: 'latest.json', s3Key: 'manifest', kind: 'metadata' },
        { filename: BUNDLE, s3Key: 'bundle', kind: 'artifact' },
      ],
      getText: async (key) => (key === 'manifest' ? text : ''),
    })
    expect(doc).not.toBeNull()
    const body = JSON.parse(doc!.body)
    expect(body.platforms['darwin-aarch64']).toEqual({
      url: `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(BUNDLE)}`,
      signature: 'SIG',
    })
    expect(body.platforms['windows-x86_64']).toBeUndefined()

    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    await publishTauri(app, '1.4.2', [
      {
        filename: 'latest.json',
        body: JSON.stringify({
          version: '1.4.2',
          platforms: {
            'darwin-aarch64': { url: `https://cdn.example/${BUNDLE}`, signature: '' },
            'windows-x86_64': { url: 'https://cdn.example/app%zz.exe', signature: 'SIG' },
          },
        }),
      },
      { filename: 'app%zz.exe', body: 'binary' },
    ])
    const feed = await resolveFeedRequest('acme', 'stable', 'latest.json', ORIGIN)
    expect(JSON.parse((feed as { body: string }).body).platforms['darwin-aarch64'].url).toBe(
      `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(BUNDLE)}`,
    )
  })

  it('rejects latest.json whose version does not match the upload', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.json' }, { filename: BUNDLE }, { filename: `${BUNDLE}.sig` }],
    })
    for (const file of init.files) {
      objects.set(
        file.key,
        file.filename === 'latest.json'
          ? JSON.stringify({ version: '2.0.0', platforms: {} })
          : file.filename.endsWith('.sig')
            ? 'SIGNATURE'
            : 'binary',
      )
    }
    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/declares version/)
  })
})
