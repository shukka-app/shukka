import './setup-db.ts'
import { resetStore } from './store-reset.ts'
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
      objects.has(key) ? { size: Buffer.byteLength(objects.get(key)!)} : null,
    ),
    getObjectText: vi.fn(async (_s3: unknown, key: string) => objects.get(key) ?? ''),
    deleteObjects: vi.fn(async (_s3: unknown, keys: string[]) => {
      for (const key of keys) objects.delete(key)
    }),
  }
})

const { createApp } = await import('~/server/apps.ts')
const { setCurrentVersion } = await import('~/server/channels.ts')
const { finalizeUpload, initUpload } = await import('~/server/releases.ts')
const releaseRoute = await import('~/routes/api/v1/apps.$appSlug.channels.$channel.release.ts')

type ServerRoute = {
  options: {
    server?: {
      handlers?: Record<string, (ctx: { request: Request; params: Record<string, string | undefined> }) => Promise<Response>>
    }
  }
}

function routeHandler(route: unknown, method: string) {
  const handler = (route as ServerRoute).options.server?.handlers?.[method]
  if (!handler) throw new Error(`Route has no ${method} handler`)
  return handler
}

const GET = routeHandler(releaseRoute.Route, 'GET')

const appInput = {
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

function metadataFor(version: string, installer: string) {
  return `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: aaa==\n    size: 5\npath: ${installer}\n`
}

async function upload(
  app: Awaited<ReturnType<typeof createApp>>,
  version: string,
  options: { release?: boolean; channel?: string; installer?: string } = {},
) {
  const installer = options.installer ?? `Acme-Setup-${version}.exe`
  const init = await initUpload(app, {
    channel: options.channel ?? 'stable',
    version,
    files: [{ filename: 'latest.yml' }, { filename: installer }],
  })
  for (const file of init.files) {
    objects.set(file.key, file.filename === 'latest.yml' ? metadataFor(version, installer) : 'binary')
  }
  const result = await finalizeUpload(app, init.uploadId, { release: options.release })
  return { installer, result }
}

function request(slug = 'acme', channel = 'stable') {
  return GET({
    request: new Request(`https://shukka.test/api/v1/apps/${slug}/channels/${channel}/release`),
    params: { appSlug: slug, channel },
  })
}

beforeEach(async () => {
  await resetStore()
  objects.clear()
})

describe('public channel release manifest', () => {
  it('lists the current released version and its artifacts without auth', async () => {
    const app = await createApp(appInput)
    const { installer } = await upload(app, '1.0.0', { release: true })

    const response = await request()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = (await response.json()) as {
      version: string
      releasedAt: number
      files: { filename: string; size: number; url: string }[]
    }
    expect(body.version).toBe('1.0.0')
    expect(body.releasedAt).toBeGreaterThan(0)
    // `latest.yml` is updater metadata; a non-updater client only downloads artifacts.
    expect(body.files).toEqual([
      {
        filename: installer,
        size: 6,
        url: `https://shukka.test/api/update/acme/stable/${installer}`,
      },
    ])
  })

  it('follows the channel current version after a rollback', async () => {
    const app = await createApp(appInput)
    const first = await upload(app, '1.0.0', { release: true })
    await upload(app, '1.1.0', { release: true })

    await setCurrentVersion(app.id, 'stable', '1.0.0')
    const body = (await (await request()).json()) as { version: string; files: { filename: string }[] }

    expect(body.version).toBe('1.0.0')
    expect(body.files.map((file) => file.filename)).toEqual([first.installer])
  })

  it('404s a channel whose current version is still a draft', async () => {
    const app = await createApp(appInput)
    await upload(app, '1.0.0')

    const response = await request()

    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toBe('not_found')
  })

  it('404s an empty channel and an unknown channel', async () => {
    const app = await createApp(appInput)
    await upload(app, '1.0.0', { release: true })

    expect((await request('acme', 'beta')).status).toBe(404)
    expect((await request('missing')).status).toBe(404)
  })

  it('uses the request origin for file URLs', async () => {
    const app = await createApp(appInput)
    const { installer } = await upload(app, '1.0.0', { release: true })

    const response = await GET({
      request: new Request('http://localhost:3000/api/v1/apps/acme/channels/stable/release'),
      params: { appSlug: 'acme', channel: 'stable' },
    })
    const body = (await response.json()) as { files: { filename: string; url: string }[] }

    expect(body.files).toEqual([
      {
        filename: installer,
        size: 6,
        url: `http://localhost:3000/api/update/acme/stable/${installer}`,
      },
    ])
  })

  it('escapes filenames in URLs', async () => {
    const app = await createApp(appInput)
    const { installer } = await upload(app, '1.0.0', {
      release: true,
      installer: 'Acme Setup 1.0.0.exe',
    })

    const body = (await (await request()).json()) as { files: { url: string }[] }

    expect(body.files[0]?.url).toBe(`https://shukka.test/api/update/acme/stable/${encodeURIComponent(installer)}`)
  })
})
