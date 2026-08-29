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
const { platformsOf } = await import('~/features/apps/platforms.ts')
const { electronAdapter } = await import('~/server/updaters/electron.ts')
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

beforeEach(async () => {
  clearObjectCache()
})

describe('tauri inferFeedTarget', () => {
  it('defaults an arch-less AppImage to linux-x86_64', () => {
    expect(tauriAdapter.inferFeedTarget('myapp.AppImage')).toBe('linux-x86_64')
    expect(tauriAdapter.inferFeedTarget('MyApp-linux.AppImage')).toBe('linux-x86_64')
  })

  it('defaults an arch-less .app.tar.gz to darwin-x86_64', () => {
    expect(tauriAdapter.inferFeedTarget('MyApp.app.tar.gz')).toBe('darwin-x86_64')
    expect(tauriAdapter.inferFeedTarget('MyApp-mac.app.tar.gz')).toBe('darwin-x86_64')
  })

  it('keeps explicit arch tokens over the x86_64 defaults', () => {
    expect(tauriAdapter.inferFeedTarget('myapp-aarch64.AppImage')).toBe('linux-aarch64')
    expect(tauriAdapter.inferFeedTarget('myapp-arm64.AppImage')).toBe('linux-aarch64')
    expect(tauriAdapter.inferFeedTarget('myapp-amd64.AppImage')).toBe('linux-x86_64')
    expect(tauriAdapter.inferFeedTarget('MyApp-aarch64.app.tar.gz')).toBe('darwin-aarch64')
    expect(tauriAdapter.inferFeedTarget('demo-updater_1.1.0_amd64.AppImage')).toBe('linux-x86_64')
    expect(tauriAdapter.inferFeedTarget('app-i686.app.tar.gz')).toBe('darwin-i686')
    expect(tauriAdapter.inferFeedTarget('app-armv7.AppImage')).toBe('linux-armv7')
  })

  it('does not invent a Windows key without an arch token', () => {
    expect(tauriAdapter.inferFeedTarget('MyApp-setup.exe')).toBeNull()
    expect(tauriAdapter.inferFeedTarget('MyApp-windows-x86_64.exe')).toBe('windows-x86_64')
  })

  it('exposes arch-less Linux and Darwin artifacts as panel badges via the adapter', () => {
    const linux = { artifacts: [{ filename: 'myapp.AppImage', kind: 'artifact' }] }
    const darwin = { artifacts: [{ filename: 'MyApp.app.tar.gz', kind: 'artifact' }] }
    expect(platformsOf(linux as Parameters<typeof platformsOf>[0], 'tauri')).toEqual(['Linux'])
    expect(platformsOf(darwin as Parameters<typeof platformsOf>[0], 'tauri')).toEqual(['macOS'])
    expect(platformsOf(linux as Parameters<typeof platformsOf>[0], 'tauri')).toEqual(
      tauriAdapter.platformsOf(linux.artifacts),
    )
  })
})

describe('electron inferFeedTarget', () => {
  it('is a no-op; Electron platforms stay yml-based', () => {
    expect(electronAdapter.inferFeedTarget('latest.yml')).toBeNull()
    expect(electronAdapter.inferFeedTarget('MyApp-1.0.0.AppImage')).toBeNull()
    expect(
      electronAdapter.platformsOf([
        { filename: 'latest.yml', kind: 'metadata' },
        { filename: 'latest-mac.yml', kind: 'metadata' },
        { filename: 'MyApp.exe', kind: 'artifact' },
      ]),
    ).toEqual(['macOS', 'Windows'])
  })
})

describe('updater kind on create', () => {
  beforeEach(async () => {
    await db.delete(apps).run()
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
  beforeEach(async () => {
    await db.delete(apps).run()
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

  it('puts an arch-less AppImage under linux-x86_64 when latest.json is absent', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    const filename = 'myapp.AppImage'
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.1.0',
      files: [{ filename }, { filename: `${filename}.sig` }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename.endsWith('.sig') ? 'SIGNATURE' : 'binary')
    }
    await finalizeUpload(app, init.uploadId, { release: true })

    const feed = await resolveFeedRequest('acme', 'stable', '', ORIGIN)
    const body = JSON.parse((feed as { body: string }).body)
    expect(body.platforms['linux-x86_64']).toEqual({
      url: `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(filename)}`,
      signature: 'SIGNATURE',
    })
  })

  it('puts an arch-less .app.tar.gz under darwin-x86_64 when latest.json is absent', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    const filename = 'MyApp.app.tar.gz'
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.1.0',
      files: [{ filename }, { filename: `${filename}.sig` }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename.endsWith('.sig') ? 'SIGNATURE' : 'binary')
    }
    await finalizeUpload(app, init.uploadId, { release: true })

    const feed = await resolveFeedRequest('acme', 'stable', '', ORIGIN)
    const body = JSON.parse((feed as { body: string }).body)
    expect(body.platforms['darwin-x86_64']).toEqual({
      url: `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(filename)}`,
      signature: 'SIGNATURE',
    })
  })

  it('keeps latest.json platform keys even when the filename would infer a different default', async () => {
    const app = await createApp({ ...baseInput, updaterKind: 'tauri' })
    const filename = 'myapp.AppImage'
    await publishTauri(app, '1.4.2', [
      { filename, body: 'binary' },
      { filename: `${filename}.sig`, body: 'SIGNATURE' },
      {
        filename: 'latest.json',
        body: JSON.stringify({
          version: '1.4.2',
          platforms: {
            'linux-aarch64': { url: `https://cdn.example/${filename}`, signature: '' },
          },
        }),
      },
    ])

    const feed = await resolveFeedRequest('acme', 'stable', 'latest.json', ORIGIN)
    const body = JSON.parse((feed as { body: string }).body)
    expect(body.platforms['linux-aarch64'].url).toBe(
      `${ORIGIN}/api/update/acme/stable/${encodeURIComponent(filename)}`,
    )
    expect(body.platforms['linux-x86_64']).toBeUndefined()
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
