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
      objects.has(key) ? { size: Buffer.byteLength(objects.get(key)!)} : null,
    ),
    getObjectText: vi.fn(async (_s3: unknown, key: string) => objects.get(key) ?? ''),
    deleteObjects: vi.fn(async (_s3: unknown, keys: string[]) => {
      for (const key of keys) objects.delete(key)
    }),
  }
})

const { and, eq, sql } = await import('drizzle-orm')
const { db } = await import('~/db/index.ts')
const { admin, apiKeys, apps, hitBuckets, sessions, versions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const { createApp } = await import('~/server/apps.ts')
const { finalizeUpload, initUpload } = await import('~/server/releases.ts')
const { resolveFeedRequest } = await import('~/server/feed.ts')
const artifactRoute = await import('~/routes/api/v1/apps.$appSlug.channels.$channel.versions.$version.artifacts.$filename.ts')

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

const GET = routeHandler(artifactRoute.Route, 'GET')

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
  return `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: aaa==\n    size: 10\npath: ${installer}\n`
}

async function upload(
  app: Awaited<ReturnType<typeof createApp>>,
  version: string,
  options: { release?: boolean; installer?: string } = {},
) {
  const installer = options.installer ?? `Acme-Setup-${version}.exe`
  const init = await initUpload(app, {
    channel: 'stable',
    version,
    files: [{ filename: 'latest.yml' }, { filename: installer }],
  })
  for (const file of init.files) {
    objects.set(file.key, file.filename === 'latest.yml' ? metadataFor(version, installer) : 'binary')
  }
  const result = await finalizeUpload(app, init.uploadId, { release: options.release })
  return { installer, result }
}

async function artifactHits(versionId: number) {
  const row = await db.select().from(versions).where(eq(versions.id, versionId)).get()
  const buckets = await db
    .select({ total: sql<number>`coalesce(sum(${hitBuckets.count}), 0)` })
    .from(hitBuckets)
    .where(and(eq(hitBuckets.versionId, versionId), eq(hitBuckets.kind, 'artifact')))
    .get()
  return { counter: row?.artifactHits ?? 0, buckets: buckets?.total ?? 0 }
}

function params(filename: string, slug = 'acme', version = '1.0.0') {
  return { appSlug: slug, channel: 'stable', version, filename }
}

beforeEach(async () => {
  await db.delete(admin).run()
  await db.delete(sessions).run()
  await db.delete(apps).run()
  objects.clear()
  await auth.initializeAdmin('correct horse battery')
})

describe('authenticated artifact download', () => {
  it('lets a session download a draft without recording hits', async () => {
    const app = await createApp(appInput)
    const { installer, result } = await upload(app, '1.0.0')
    const token = await auth.login('correct horse battery')

    const response = await GET({
      request: new Request('https://shukka.test/download', {
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
      }),
      params: params(installer),
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toMatch(/Acme-Setup-1\.0\.0\.exe\?get$/)
    expect(await artifactHits(result.versionId)).toEqual({ counter: 0, buckets: 0 })
  })

  it('lets a bound API key download a released file without recording hits', async () => {
    const app = await createApp(appInput)
    const { installer, result } = await upload(app, '1.0.0', { release: true })
    const issued = auth.generateApiKey()
    await db.insert(apiKeys).values({ appId: app.id, name: 'ci', hash: issued.hash, hint: issued.hint }).run()

    const response = await GET({
      request: new Request('https://shukka.test/download', {
        headers: { authorization: `Bearer ${issued.plaintext}` },
      }),
      params: params(installer),
    })

    expect(response.status).toBe(302)
    expect(await artifactHits(result.versionId)).toEqual({ counter: 0, buckets: 0 })

    await resolveFeedRequest('acme', 'stable', installer, 'https://updates.test')
    expect(await artifactHits(result.versionId)).toEqual({ counter: 1, buckets: 1 })
  })

  it('404s an unknown filename on that version', async () => {
    const app = await createApp(appInput)
    await upload(app, '1.0.0')
    const token = await auth.login('correct horse battery')

    const response = await GET({
      request: new Request('https://shukka.test/download', {
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
      }),
      params: params('missing.exe'),
    })

    expect(response.status).toBe(404)
    expect(((await response.json()) as { error: string }).error).toBe('not_found')
  })

  it('rejects missing auth and a foreign API key', async () => {
    const app = await createApp(appInput)
    const other = await createApp({ ...appInput, name: 'Other', slug: 'other', s3Prefix: 'other' })
    const { installer } = await upload(app, '1.0.0')
    const foreign = auth.generateApiKey()
    await db.insert(apiKeys).values({ appId: other.id, name: 'ci', hash: foreign.hash, hint: foreign.hint }).run()

    const anon = await GET({
      request: new Request('https://shukka.test/download'),
      params: params(installer),
    })
    expect(anon.status).toBe(401)

    const forbidden = await GET({
      request: new Request('https://shukka.test/download', {
        headers: { authorization: `Bearer ${foreign.plaintext}` },
      }),
      params: params(installer),
    })
    expect(forbidden.status).toBe(403)
  })

  it('round-trips a dotted updater archive name', async () => {
    const app = await createApp({ ...appInput, updaterKind: 'tauri' })
    const installer = 'demo-app-1.0.0-aarch64.app.tar.gz'
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [
        { filename: installer },
        { filename: `${installer}.sig` },
      ],
    })
    for (const file of init.files) objects.set(file.key, 'binary')
    await finalizeUpload(app, init.uploadId)
    const token = await auth.login('correct horse battery')

    const response = await GET({
      request: new Request('https://shukka.test/download', {
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
      }),
      params: params(installer),
    })
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toContain('demo-app-1.0.0-aarch64.app.tar.gz')
  })
})
