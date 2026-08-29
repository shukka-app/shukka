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
const { admin, apiKeys, apps, sessions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const { createApp } = await import('~/server/apps.ts')
const initRoute = await import('~/routes/api/v1/upload.init.ts')

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

function makeApp(slug: string) {
  return createApp({
    name: slug,
    slug,
    s3Endpoint: null,
    s3Region: 'us-east-1',
    s3Bucket: 'releases',
    s3Prefix: slug,
    s3AccessKeyId: 'key',
    s3SecretAccessKey: 'secret',
    s3ForcePathStyle: false,
  })
}

async function keyFor(appId: number) {
  const { plaintext, hash, hint } = auth.generateApiKey()
  await db.insert(apiKeys).values({ appId, name: 'ci', hash, hint }).run()
  return plaintext
}

const initBody = {
  app: 'acme',
  channel: 'stable',
  version: '1.0.0',
  files: [
    { filename: 'latest.yml', size: 32 },
    { filename: 'App.exe', size: 64 },
  ],
}

describe('upload init route', () => {
  beforeEach(async () => {
    await db.delete(admin).run()
    await db.delete(sessions).run()
    await db.delete(apps).run()
    objects.clear()
    await auth.initializeAdmin('correct horse battery')
  })

  it('accepts a valid Bearer init and returns uploadId and files', async () => {
    const app = await makeApp('acme')
    const plaintext = await keyFor(app.id)
    const POST = routeHandler(initRoute.Route, 'POST')
    const response = await POST({
      request: new Request('https://shukka.test/api/v1/upload/init', {
        method: 'POST',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify(initBody),
      }),
      params: {},
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as { uploadId: string; files: { filename: string; uploadUrl: string }[] }
    expect(body.uploadId).toBeTruthy()
    expect(body.files.map((file) => file.filename)).toEqual(['latest.yml', 'App.exe'])
    expect(body.files.every((file) => file.uploadUrl.startsWith('https://storage.test/'))).toBe(true)
  })

  it('rejects a missing Authorization header as unauthorized', async () => {
    await makeApp('acme')
    const POST = routeHandler(initRoute.Route, 'POST')
    const response = await POST({
      request: new Request('https://shukka.test/api/v1/upload/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(initBody),
      }),
      params: {},
    })
    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: string }).error).toBe('unauthorized')
  })

  it('rejects a session cookie without a Bearer key as unauthorized', async () => {
    await makeApp('acme')
    const token = await auth.login('correct horse battery')
    const POST = routeHandler(initRoute.Route, 'POST')
    const response = await POST({
      request: new Request('https://shukka.test/api/v1/upload/init', {
        method: 'POST',
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(initBody),
      }),
      params: {},
    })
    expect(response.status).toBe(401)
    expect(((await response.json()) as { error: string }).error).toBe('unauthorized')
  })

  it('rejects malformed or missing files as invalid_request', async () => {
    const app = await makeApp('acme')
    const plaintext = await keyFor(app.id)
    const POST = routeHandler(initRoute.Route, 'POST')

    for (const body of [{ ...initBody, files: [] }, { ...initBody, files: undefined }, { app: 'acme', channel: 'stable', version: '1.0.0' }]) {
      const response = await POST({
        request: new Request('https://shukka.test/api/v1/upload/init', {
          method: 'POST',
          headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        params: {},
      })
      expect(response.status).toBe(400)
      expect(((await response.json()) as { error: string }).error).toBe('invalid_request')
    }
  })

  it('rejects a key bound to another app as forbidden', async () => {
    const app = await makeApp('acme')
    const plaintext = await keyFor(app.id)
    const POST = routeHandler(initRoute.Route, 'POST')
    const response = await POST({
      request: new Request('https://shukka.test/api/v1/upload/init', {
        method: 'POST',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...initBody, app: 'b' }),
      }),
      params: {},
    })
    expect(response.status).toBe(403)
    expect(((await response.json()) as { error: string }).error).toBe('forbidden')
  })
})
