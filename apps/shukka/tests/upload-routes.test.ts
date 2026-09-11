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
      objects.has(key) ? { size: Buffer.byteLength(objects.get(key)!) } : null,
    ),
    getObjectText: vi.fn(async (_s3: unknown, key: string) => objects.get(key) ?? ''),
    deleteObjects: vi.fn(async (_s3: unknown, keys: string[]) => {
      for (const key of keys) objects.delete(key)
    }),
  }
})

const { store } = await import('~/lib/store.ts')
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
  await store.insertApiKey({ appId, name: 'ci', hash, hint })
  return plaintext
}

async function allVersions() {
  const apps = await store.listApps('createdAt')
  const channels = await store.listChannelsForApps(apps.map((app) => app.id))
  return store.listVersionsForChannels(channels.map((channel) => channel.id))
}

async function allChannels() {
  const apps = await store.listApps('createdAt')
  return store.listChannelsForApps(apps.map((app) => app.id))
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
    await resetStore()
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


const appRoute = await import('~/routes/api/v1/apps.$appSlug.ts')
const finalizeRoute = await import('~/routes/api/v1/upload.finalize.ts')
const metadataRoute = await import('~/routes/api/v1/apps.$appSlug.channels.$channel.versions.$version.metadata.ts')
const { setCurrentVersion } = await import('~/server/channels.ts')

describe('release metadata HTTP contract', () => {
  let key: string
  let cookie: string
  let appId: number

  beforeEach(async () => {
    await resetStore()
    objects.clear()
    cookie = `${auth.SESSION_COOKIE}=${await auth.initializeAdmin('correct horse battery')}`
    const app = await makeApp('acme')
    appId = app.id
    key = await keyFor(app.id)
  })

  async function upload(version: string, options: Record<string, unknown> = {}) {
    const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
    const init = await routeHandler(initRoute.Route, 'POST')({
      request: new Request('https://shukka.test/api/v1/upload/init', {
        method: 'POST', headers,
        body: JSON.stringify({ app: 'acme', channel: 'stable', version, files: [{ filename: 'latest.yml' }, { filename: 'App.exe' }] }),
      }), params: {},
    })
    expect(init.status).toBe(200)
    const pending = await init.json() as { uploadId: string; files: { filename: string; key: string }[] }
    for (const file of pending.files) {
      objects.set(file.key, file.filename === 'latest.yml'
        ? `version: ${version}\nfiles:\n  - url: App.exe\n    sha512: abc\n    size: 6\npath: App.exe\nsha512: abc\n`
        : 'binary')
    }
    return routeHandler(finalizeRoute.Route, 'POST')({
      request: new Request('https://shukka.test/api/v1/upload/finalize', {
        method: 'POST', headers,
        body: JSON.stringify({ app: 'acme', uploadId: pending.uploadId, ...options }),
      }), params: {},
    })
  }

  function metadata(method: string, version: string, headers: Record<string, string> = {}, body?: unknown) {
    return routeHandler(metadataRoute.Route, method)({
      request: new Request(`https://shukka.test/api/v1/apps/acme/channels/stable/versions/${version}/metadata`, {
        method, headers: { 'content-type': 'application/json', ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }), params: { appSlug: 'acme', channel: 'stable', version },
    })
  }

  it('publishes metadata atomically and keeps exact-version data through rollback without inheritance', async () => {
    const custom = { rollout: { regions: ['cn', 'us'], enabled: true, percentage: 25 }, nullable: null }
    expect((await upload('1.0.0', { release: true, metadata: custom })).status).toBe(200)
    const first = await metadata('GET', '1.0.0')
    expect(first.headers.get('cache-control')).toBe('no-store')
    const detail = await routeHandler(appRoute.Route, 'GET')({
      request: new Request('https://shukka.test/api/v1/apps/acme', { headers: { cookie } }),
      params: { appSlug: 'acme' },
    })
    expect(detail.status).toBe(200)
    const appDetail = await detail.json() as { channels: { versions: Record<string, unknown>[] }[] }
    expect(appDetail.channels[0].versions[0]).not.toHaveProperty('metadata')
    expect(await first.json()).toEqual({ version: '1.0.0', metadata: custom })
    expect((await upload('2.0.0', { release: true })).status).toBe(200)
    expect(await (await metadata('GET', '2.0.0')).json()).toEqual({ version: '2.0.0', metadata: {} })
    await setCurrentVersion(appId, 'stable', '1.0.0')
    expect(await (await metadata('GET', '1.0.0')).json()).toEqual({ version: '1.0.0', metadata: custom })
    expect((await metadata('GET', '2.0.0')).status).toBe(200)
    expect((await metadata('GET', 'missing')).status).toBe(404)
  })

  it('hides drafts anonymously while allowing session and app-key reads and edits', async () => {
    expect((await upload('1.0.0', { metadata: { draft: true } })).status).toBe(200)
    expect((await metadata('GET', '1.0.0')).status).toBe(404)
    const actors: Record<string, string>[] = [{ cookie }, { authorization: `Bearer ${key}` }]
    for (const headers of actors) {
      expect((await metadata('GET', '1.0.0', headers)).status).toBe(200)
      expect((await metadata('PUT', '1.0.0', headers, { metadata: { edited: true } })).status).toBe(200)
    }
    expect((await metadata('PUT', '1.0.0', {}, { metadata: {} })).status).toBe(401)
    const otherKey = await keyFor((await makeApp('other')).id)
    for (const version of ['1.0.0', 'missing']) {
      for (const method of ['GET', 'PUT']) {
        const body = method === 'PUT' ? { metadata: {} } : undefined
        expect((await metadata(method, version, { authorization: 'Bearer invalid', cookie }, body)).status).toBe(401)
        expect((await metadata(method, version, { authorization: `Bearer ${otherKey}` }, body)).status).toBe(403)
      }
    }
    await setCurrentVersion(appId, 'stable', '1.0.0')
    expect((await metadata('GET', '1.0.0', { authorization: 'Bearer invalid' })).status).toBe(401)
  })

  it('replaces and clears the entire object without changing release state or hit counters', async () => {
    expect((await upload('1.0.0', { release: true, metadata: { old: 1, nested: { first: true } } })).status).toBe(200)
    const beforeVersions = await allVersions()
    const beforeChannels = await allChannels()
    for (const next of [{ nested: { second: true } }, {}]) {
      const result = await metadata('PUT', '1.0.0', { authorization: `Bearer ${key}` }, { metadata: next })
      expect(result.status).toBe(200)
      expect(await result.json()).toEqual({ version: '1.0.0', metadata: next })
      expect(await (await metadata('GET', '1.0.0')).json()).toEqual({ version: '1.0.0', metadata: next })
      expect(await allVersions()).toEqual(beforeVersions.map(row => ({ ...row, metadata: next })))
      expect(await allChannels()).toEqual(beforeChannels)
    }
  })

  it('preserves arbitrary keys at every depth and includes them in the size limit', async () => {
    const raw = '{"__proto__":{"retained":true},"constructor":"custom","nested":{"__proto__":[1,null,{"__proto__":"inside"}]}}'
    const value = JSON.parse(raw)
    expect((await upload('1.0.0', { release: true, metadata: value })).status).toBe(200)
    expect(JSON.stringify((await (await metadata('GET', '1.0.0')).json() as { metadata: unknown }).metadata)).toBe(raw)
    const replacement = JSON.parse('{"nested":{"__proto__":{"other":true}}}')
    expect((await metadata('PUT', '1.0.0', { cookie }, { metadata: replacement })).status).toBe(200)
    expect(JSON.stringify((await (await metadata('GET', '1.0.0')).json() as { metadata: unknown }).metadata)).toBe(JSON.stringify(replacement))
    for (const oversized of [
      JSON.parse(`{"__proto__":"${'x'.repeat(16384)}"}`),
      JSON.parse(`{"nested":{"__proto__":"${'x'.repeat(16384)}"}}`),
    ]) {
      expect((await metadata('PUT', '1.0.0', { cookie }, { metadata: oversized })).status).toBe(400)
    }
    expect((await upload('2.0.0', { metadata: JSON.parse(`{"__proto__":"${'x'.repeat(16384)}"}`) })).status).toBe(400)
    expect((await (await metadata('GET', '1.0.0')).json() as { metadata: unknown }).metadata).toEqual(replacement)
  })

  it('rejects overflowing JSON numbers before finalize and PUT can persist null in their place', async () => {
    expect((await upload('1.0.0', { release: true, metadata: { preserved: true } })).status).toBe(200)
    const before = await allVersions()
    for (const raw of ['{"value":1e400}', '{"nested":[{"value":-1e400}]}']) {
      const headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' }
      const finalized = await routeHandler(finalizeRoute.Route, 'POST')({
        request: new Request('https://shukka.test/api/v1/upload/finalize', {
          method: 'POST', headers, body: `{"app":"acme","uploadId":"unused","metadata":${raw}}`,
        }), params: {},
      })
      expect(finalized.status).toBe(400)
      expect((await finalized.json() as { error: string }).error).toBe('invalid_request')
      const replaced = await routeHandler(metadataRoute.Route, 'PUT')({
        request: new Request('https://shukka.test/api/v1/apps/acme/channels/stable/versions/1.0.0/metadata', {
          method: 'PUT', headers, body: `{"metadata":${raw}}`,
        }), params: { appSlug: 'acme', channel: 'stable', version: '1.0.0' },
      })
      expect(replaced.status).toBe(400)
    }
    expect(await allVersions()).toEqual(before)
  })

  it('rejects invalid metadata before creating or mutating a version and measures compact UTF-8 bytes', async () => {
    expect((await upload('1.0.0', { release: true, metadata: { preserved: true } })).status).toBe(200)
    const before = await allVersions()
    const boundary = { x: '界'.repeat(5458) + 'aa' }
    expect(Buffer.byteLength(JSON.stringify(boundary))).toBe(16384)
    const invalid = [null, [], 'text', 1, false, { x: boundary.x + 'a' }]
    for (const [index, value] of invalid.entries()) {
      const finalized = await upload(`2.0.${index}`, { release: true, metadata: value })
      expect(finalized.status).toBe(400)
      expect((await finalized.json() as { error: string }).error).toBe('invalid_request')
      expect((await metadata('PUT', '1.0.0', { cookie }, { metadata: value })).status).toBe(400)
    }
    expect((await metadata('PUT', '1.0.0', { cookie }, {})).status).toBe(400)
    expect(await allVersions()).toEqual(before)
    expect((await allChannels())[0].currentVersionId).toBe(before[0].id)
    expect((await metadata('PUT', '1.0.0', { cookie }, { metadata: boundary })).status).toBe(200)
    expect((await upload('3.0.0', { metadata: boundary })).status).toBe(200)
  })
})
