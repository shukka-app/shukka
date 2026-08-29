import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/lib/storage.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/storage.ts')>()
  return {
    ...actual,
    verifyWritable: vi.fn(async () => undefined),
    headObject: vi.fn(async () => ({ size: 1 })),
  }
})

const { eq } = await import('drizzle-orm')
const { db } = await import('~/db/index.ts')
const { admin, apiKeys, apps, artifacts, channels, sessions, versions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const { createApp } = await import('~/server/apps.ts')
const { headObject } = await import('~/lib/storage.ts')
const appRoute = await import('~/routes/api/v1/apps.$appSlug.ts')
const keysRoute = await import('~/routes/api/v1/apps.$appSlug.keys.ts')
const keyIdRoute = await import('~/routes/api/v1/apps.$appSlug.keys.$keyId.ts')

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

const appFields = {
  s3Endpoint: null as string | null,
  s3Region: 'us-east-1',
  s3Bucket: 'releases',
  s3AccessKeyId: 'key',
  s3ForcePathStyle: false,
}

function makeApp(slug: string) {
  return createApp({
    name: slug,
    slug,
    s3Prefix: slug,
    s3SecretAccessKey: 'secret',
    ...appFields,
  })
}

function appPayload(slug: string, overrides: Record<string, unknown> = {}) {
  return {
    name: slug,
    slug,
    s3Prefix: slug,
    ...appFields,
    ...overrides,
  }
}

function issueKey(appId: number) {
  const { plaintext, hash, hint } = auth.generateApiKey()
  const key = db.insert(apiKeys).values({ appId, name: 'ci', hash, hint }).returning().get()
  return { plaintext, key }
}

function addPublishedArtifact(appId: number, s3Key = 'acme/stable/1.0.0/App.exe') {
  const channel = db.select().from(channels).where(eq(channels.appId, appId)).get()
  if (!channel) throw new Error('missing channel')
  const version = db
    .insert(versions)
    .values({
      appId,
      channelId: channel.id,
      version: '1.0.0',
      releasedAt: Math.floor(Date.now() / 1000),
    })
    .returning()
    .get()
  db.insert(artifacts)
    .values({
      versionId: version.id,
      filename: 'App.exe',
      s3Key,
      size: 64,
      kind: 'artifact',
    })
    .run()
  return s3Key
}

describe('app API auth matrix', () => {
  beforeEach(() => {
    db.delete(admin).run()
    db.delete(sessions).run()
    db.delete(apps).run()
    vi.mocked(headObject).mockClear()
    auth.initializeAdmin('correct horse battery')
  })

  it('lets a bound API key read and patch the app, but not delete it or manage keys', async () => {
    const app = await makeApp('acme')
    const { plaintext, hash, hint } = auth.generateApiKey()
    const key = db.insert(apiKeys).values({ appId: app.id, name: 'ci', hash, hint }).returning().get()

    const GET = routeHandler(appRoute.Route, 'GET')
    const ok = await GET({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        headers: { authorization: `Bearer ${plaintext}` },
      }),
      params: { appSlug: 'acme' },
    })
    expect(ok.status).toBe(200)
    const detail = (await ok.json()) as { app: { slug: string } }
    expect(detail.app.slug).toBe('acme')
    expect(detail).not.toHaveProperty('keys')

    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const patched = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify(appPayload('acme', { name: 'Acme' })),
      }),
      params: { appSlug: 'acme' },
    })
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { app: { name: string } }).app.name).toBe('Acme')

    const DELETE = routeHandler(appRoute.Route, 'DELETE')
    const forbidden = await DELETE({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${plaintext}` },
      }),
      params: { appSlug: 'acme' },
    })
    expect(forbidden.status).toBe(403)

    const GET_KEYS = routeHandler(keysRoute.Route, 'GET')
    const keysDenied = await GET_KEYS({
      request: new Request('https://shukka.test/api/v1/apps/acme/keys', {
        headers: { authorization: `Bearer ${plaintext}` },
      }),
      params: { appSlug: 'acme' },
    })
    expect(keysDenied.status).toBe(403)

    const DELETE_KEY = routeHandler(keyIdRoute.Route, 'DELETE')
    const keyDeleteDenied = await DELETE_KEY({
      request: new Request(`https://shukka.test/api/v1/apps/acme/keys/${key.id}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${plaintext}` },
      }),
      params: { appSlug: 'acme', keyId: String(key.id) },
    })
    expect(keyDeleteDenied.status).toBe(403)

    const POST_KEY = routeHandler(keysRoute.Route, 'POST')
    const keyDenied = await POST_KEY({
      request: new Request('https://shukka.test/api/v1/apps/acme/keys', {
        method: 'POST',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'stolen' }),
      }),
      params: { appSlug: 'acme' },
    })
    expect(keyDenied.status).toBe(403)
  })

  it('includes key metadata on session app detail', async () => {
    const app = await makeApp('acme')
    const { hash, hint } = auth.generateApiKey()
    db.insert(apiKeys).values({ appId: app.id, name: 'ci', hash, hint }).returning().get()
    const token = auth.login('correct horse battery')
    const GET = routeHandler(appRoute.Route, 'GET')
    const listed = await GET({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
      }),
      params: { appSlug: 'acme' },
    })
    expect(listed.status).toBe(200)
    const body = (await listed.json()) as { keys: { hint: string }[] }
    expect(Array.isArray(body.keys)).toBe(true)
    expect(body.keys.map((key) => key.hint)).toContain(hint)
  })

  it('lets a session list keys', async () => {
    await makeApp('acme')
    const token = auth.login('correct horse battery')
    const GET_KEYS = routeHandler(keysRoute.Route, 'GET')
    const listed = await GET_KEYS({
      request: new Request('https://shukka.test/api/v1/apps/acme/keys', {
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
      }),
      params: { appSlug: 'acme' },
    })
    expect(listed.status).toBe(200)
    expect(((await listed.json()) as { keys: unknown[] }).keys).toEqual([])
  })

  it('rejects an unauthenticated app read', async () => {
    await makeApp('acme')
    const GET = routeHandler(appRoute.Route, 'GET')
    const denied = await GET({
      request: new Request('https://shukka.test/api/v1/apps/acme'),
      params: { appSlug: 'acme' },
    })
    expect(denied.status).toBe(401)
    expect(((await denied.json()) as { error: string }).error).toBe('unauthorized')
  })

  it('lets a session issue a key', async () => {
    const app = await makeApp('acme')
    const token = auth.login('correct horse battery')
    const POST_KEY = routeHandler(keysRoute.Route, 'POST')
    const created = await POST_KEY({
      request: new Request('https://shukka.test/api/v1/apps/acme/keys', {
        method: 'POST',
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ci' }),
      }),
      params: { appSlug: 'acme' },
    })
    expect(created.status).toBe(201)
    const body = (await created.json()) as { plaintext: string }
    expect(body.plaintext.startsWith('shk_')).toBe(true)
    expect(app.id).toBeTypeOf('number')
  })

  it('lets a key PATCH only the app name', async () => {
    const app = await makeApp('acme')
    const { plaintext } = issueKey(app.id)
    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const patched = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify(appPayload('acme', { name: 'Acme' })),
      }),
      params: { appSlug: 'acme' },
    })
    expect(patched.status).toBe(200)
    expect(((await patched.json()) as { app: { name: string } }).app.name).toBe('Acme')
    expect(db.select().from(apps).where(eq(apps.id, app.id)).get()?.name).toBe('Acme')
  })

  it('forbids a key PATCH that changes s3Endpoint', async () => {
    const app = await makeApp('acme')
    const { plaintext } = issueKey(app.id)
    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const denied = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify(appPayload('acme', { s3Endpoint: 'https://attacker.example' })),
      }),
      params: { appSlug: 'acme' },
    })
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as { error: string }).error).toBe('forbidden')
    expect(db.select().from(apps).where(eq(apps.id, app.id)).get()?.s3Endpoint).toBeNull()
  })

  it('lets a key PATCH resubmit unchanged storage fields', async () => {
    const app = await makeApp('acme')
    const { plaintext } = issueKey(app.id)
    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const patched = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify(appPayload('acme')),
      }),
      params: { appSlug: 'acme' },
    })
    expect(patched.status).toBe(200)
    expect(db.select().from(apps).where(eq(apps.id, app.id)).get()?.slug).toBe('acme')
  })

  it('forbids a key PATCH that includes s3SecretAccessKey', async () => {
    const app = await makeApp('acme')
    const { plaintext } = issueKey(app.id)
    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const denied = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { authorization: `Bearer ${plaintext}`, 'content-type': 'application/json' },
        body: JSON.stringify(appPayload('acme', { s3SecretAccessKey: 'secret' })),
      }),
      params: { appSlug: 'acme' },
    })
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as { error: string }).error).toBe('forbidden')
  })

  it('probes the newest artifact before a session storage-identity change', async () => {
    const app = await makeApp('acme')
    const s3Key = addPublishedArtifact(app.id)
    const token = auth.login('correct horse battery')
    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const body = JSON.stringify(appPayload('acme', { s3Bucket: 'other-bucket' }))

    vi.mocked(headObject).mockResolvedValueOnce(null)
    const missing = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
        body,
      }),
      params: { appSlug: 'acme' },
    })
    expect(missing.status).toBe(400)
    expect(((await missing.json()) as { message: string }).message).toMatch(
      /not found at the new storage location/,
    )
    expect(db.select().from(apps).where(eq(apps.id, app.id)).get()?.s3Bucket).toBe('releases')
    expect(headObject).toHaveBeenCalledWith(expect.objectContaining({ bucket: 'other-bucket' }), s3Key)

    vi.mocked(headObject).mockResolvedValueOnce({ size: 64 })
    const ok = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
        body,
      }),
      params: { appSlug: 'acme' },
    })
    expect(ok.status).toBe(200)
    expect(db.select().from(apps).where(eq(apps.id, app.id)).get()?.s3Bucket).toBe('other-bucket')
  })

  it('does not probe artifacts when changing storage identity with no versions', async () => {
    const app = await makeApp('acme')
    const token = auth.login('correct horse battery')
    vi.mocked(headObject).mockClear()
    const PATCH = routeHandler(appRoute.Route, 'PATCH')
    const patched = await PATCH({
      request: new Request('https://shukka.test/api/v1/apps/acme', {
        method: 'PATCH',
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(appPayload('acme', { s3Bucket: 'other-bucket' })),
      }),
      params: { appSlug: 'acme' },
    })
    expect(patched.status).toBe(200)
    expect(headObject).not.toHaveBeenCalled()
    expect(db.select().from(apps).where(eq(apps.id, app.id)).get()?.s3Bucket).toBe('other-bucket')
  })
})
