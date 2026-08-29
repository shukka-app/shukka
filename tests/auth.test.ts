import './setup-db.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/lib/storage.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/storage.ts')>()
  return { ...actual, verifyWritable: vi.fn(async () => undefined) }
})

const { db } = await import('~/db/index.ts')
const { admin, apiKeys, apps, sessions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const { resetRateLimitForTests, clientIp, isLimited, recordFailure, recordSuccess } = await import('~/lib/rate-limit.ts')
const { createApp } = await import('~/server/apps.ts')
const appsServer = await import('~/server/apps.ts')
const { ShukkaError } = await import('~/lib/errors.ts')
const loginRoute = await import('~/routes/api/admin/login.ts')

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

async function keyFor(appId: number, name = 'ci') {
  const { plaintext, hash, hint } = auth.generateApiKey()
  const row = await db.insert(apiKeys).values({ appId, name, hash, hint }).returning().get()
  return { plaintext, row }
}

const bearer = (token: string) => new Request('https://shukka.test/api/v1/upload/init', {
  headers: { authorization: `Bearer ${token}` },
})

describe('admin session', () => {
  beforeEach(async () => {
    await db.delete(admin).run()
    await db.delete(sessions).run()
    await db.delete(apps).run()
  })

  it('reports uninitialized until an admin password is set', async () => {
    expect(await auth.isInitialized()).toBe(false)
    await auth.initializeAdmin('correct horse battery')
    expect(await auth.isInitialized()).toBe(true)
  })

  it('refuses a second initialization', async () => {
    await auth.initializeAdmin('correct horse battery')
    await expect(auth.initializeAdmin('another one')).rejects.toThrow(ShukkaError)
  })

  it('rejects short passwords', async () => {
    await expect(auth.initializeAdmin('short')).rejects.toThrow(/at least 8/)
  })

  it('issues a session only for the right password', async () => {
    await auth.initializeAdmin('correct horse battery')
    expect(await auth.sessionIsValid(await auth.login('correct horse battery'))).toBe(true)
    await expect(auth.login('wrong')).rejects.toThrow(ShukkaError)
  })

  it('invalidates every session when the password changes', async () => {
    await auth.initializeAdmin('correct horse battery')
    const old = await auth.login('correct horse battery')
    const fresh = await auth.changePassword('correct horse battery', 'a brand new one')

    expect(await auth.sessionIsValid(old)).toBe(false)
    expect(await auth.sessionIsValid(fresh)).toBe(true)
  })

  it('drops the session on sign out', async () => {
    await auth.initializeAdmin('correct horse battery')
    const token = await auth.login('correct horse battery')
    await auth.destroySession(token)
    expect(await auth.sessionIsValid(token)).toBe(false)
  })

  it('reads the session cookie out of a request', () => {
    const request = new Request('https://shukka.test/apps', {
      headers: { cookie: `other=1; ${auth.SESSION_COOKIE}=abc123; trailing=2` },
    })
    expect(auth.readSessionCookie(request)).toBe('abc123')
  })

  it('treats an expired session as invalid and prunes it on createSession', async () => {
    const token = await auth.initializeAdmin('correct horse battery')
    expect(await auth.sessionIsValid(token)).toBe(true)

    await db.update(sessions).set({ expiresAt: Math.floor(Date.now() / 1000) - 60 }).run()
    expect(await auth.sessionIsValid(token)).toBe(false)

    const next = await auth.createSession()
    expect(await auth.sessionIsValid(token)).toBe(false)
    expect(await auth.sessionIsValid(next)).toBe(true)
    expect(await db.select().from(sessions).all()).toHaveLength(1)
  })

  it('returns null when the session cookie is not valid percent-encoding', () => {
    const request = new Request('https://shukka.test/apps', {
      headers: { cookie: `${auth.SESSION_COOKIE}=%E0%A4%A` },
    })
    expect(auth.readSessionCookie(request)).toBeNull()
  })

  it('keeps setup, login, and change-password on scrypt$ when the env is unset', async () => {
    delete process.env.SHUKKA_PASSWORD_HASH
    await auth.initializeAdmin('correct horse battery')
    const afterSetup = await db.select().from(admin).get()
    expect(afterSetup?.passwordHash.startsWith('scrypt$')).toBe(true)
    expect(await auth.sessionIsValid(await auth.login('correct horse battery'))).toBe(true)

    await auth.changePassword('correct horse battery', 'a brand new one')
    const afterChange = await db.select().from(admin).get()
    expect(afterChange?.passwordHash.startsWith('scrypt$')).toBe(true)
    expect(await auth.sessionIsValid(await auth.login('a brand new one'))).toBe(true)
  })

  it('treats SHUKKA_PASSWORD_HASH=scrypt as the default writer', async () => {
    process.env.SHUKKA_PASSWORD_HASH = 'scrypt'
    try {
      await auth.initializeAdmin('correct horse battery')
      expect((await db.select().from(admin).get())?.passwordHash.startsWith('scrypt$')).toBe(true)
    } finally {
      delete process.env.SHUKKA_PASSWORD_HASH
    }
  })

  it('writes pbkdf2$ only when that env is set before first setup', async () => {
    process.env.SHUKKA_PASSWORD_HASH = 'pbkdf2'
    try {
      await auth.initializeAdmin('correct horse battery')
      const afterSetup = await db.select().from(admin).get()
      expect(afterSetup?.passwordHash.startsWith('pbkdf2$')).toBe(true)
      expect(await auth.sessionIsValid(await auth.login('correct horse battery'))).toBe(true)

      process.env.SHUKKA_PASSWORD_HASH = 'scrypt'
      await auth.changePassword('correct horse battery', 'a brand new one')
      const afterChange = await db.select().from(admin).get()
      expect(afterChange?.passwordHash.startsWith('pbkdf2$')).toBe(true)
      expect(afterChange?.passwordHash.startsWith('scrypt$')).toBe(false)
      expect(await auth.sessionIsValid(await auth.login('a brand new one'))).toBe(true)
    } finally {
      delete process.env.SHUKKA_PASSWORD_HASH
    }
  })

  it('does not write pbkdf2$ after a scrypt setup even if the env flips', async () => {
    delete process.env.SHUKKA_PASSWORD_HASH
    await auth.initializeAdmin('correct horse battery')
    expect((await db.select().from(admin).get())?.passwordHash.startsWith('scrypt$')).toBe(true)

    process.env.SHUKKA_PASSWORD_HASH = 'pbkdf2'
    try {
      await auth.changePassword('correct horse battery', 'a brand new one')
      const afterChange = await db.select().from(admin).get()
      expect(afterChange?.passwordHash.startsWith('scrypt$')).toBe(true)
      expect(afterChange?.passwordHash.startsWith('pbkdf2$')).toBe(false)
      expect(await auth.sessionIsValid(await auth.login('a brand new one'))).toBe(true)
    } finally {
      delete process.env.SHUKKA_PASSWORD_HASH
    }
  })

  it('rejects an invalid SHUKKA_PASSWORD_HASH at setup', async () => {
    process.env.SHUKKA_PASSWORD_HASH = 'argon2'
    try {
      try {
        await auth.initializeAdmin('correct horse battery')
        throw new Error('expected initializeAdmin to reject')
      } catch (error) {
        expect(error).toBeInstanceOf(ShukkaError)
        expect((error as { code: string }).code).toBe('invalid_request')
      }
      expect(await auth.isInitialized()).toBe(false)
    } finally {
      delete process.env.SHUKKA_PASSWORD_HASH
    }
  })

  it('logs in against both stored prefixes', async () => {
    delete process.env.SHUKKA_PASSWORD_HASH
    await auth.initializeAdmin('correct horse battery')
    expect(await auth.sessionIsValid(await auth.login('correct horse battery'))).toBe(true)

    await db.delete(admin).run()
    await db.delete(sessions).run()
    process.env.SHUKKA_PASSWORD_HASH = 'pbkdf2'
    try {
      await auth.initializeAdmin('correct horse battery')
      expect((await db.select().from(admin).get())?.passwordHash.startsWith('pbkdf2$')).toBe(true)
      expect(await auth.sessionIsValid(await auth.login('correct horse battery'))).toBe(true)
    } finally {
      delete process.env.SHUKKA_PASSWORD_HASH
    }
  })

  it('sets Secure only for https, forwarded proto, or SHUKKA_SECURE_COOKIES', () => {
    expect(auth.cookieShouldBeSecure(new Request('http://localhost:3000/'))).toBe(false)
    expect(auth.cookieShouldBeSecure(new Request('https://shukka.test/'))).toBe(true)
    expect(
      auth.cookieShouldBeSecure(
        new Request('http://localhost:3000/', { headers: { 'X-Forwarded-Proto': 'https' } }),
      ),
    ).toBe(true)

    const previous = process.env.SHUKKA_SECURE_COOKIES
    process.env.SHUKKA_SECURE_COOKIES = '1'
    try {
      expect(auth.cookieShouldBeSecure(new Request('http://localhost:3000/'))).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.SHUKKA_SECURE_COOKIES
      else process.env.SHUKKA_SECURE_COOKIES = previous
    }

    const local = new Request('http://localhost:3000/')
    expect(auth.sessionCookieHeader('tok', local)).not.toMatch(/;\s*Secure(?:;|$)/)
    expect(auth.sessionCookieHeader('tok', new Request('https://shukka.test/'))).toMatch(/;\s*Secure(?:;|$)/)
    expect(auth.clearSessionCookieHeader(local)).not.toMatch(/;\s*Secure(?:;|$)/)
  })
})

describe('app actor', () => {
  beforeEach(async () => {
    await db.delete(admin).run()
    await db.delete(sessions).run()
    await db.delete(apps).run()
  })

  it('resolves a session actor and a matching key, and rejects a foreign key', async () => {
    await auth.initializeAdmin('correct horse battery')
    const token = await auth.login('correct horse battery')
    const acme = await makeApp('acme')
    const { plaintext } = await keyFor(acme.id)

    const session = new Request('https://shukka.test/api/v1/apps/acme', {
      headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
    })
    expect((await auth.requireAppActor(session, 'acme')).via).toBe('session')
    expect((await auth.requireAppActor(session, 'acme')).app.slug).toBe('acme')

    const keyReq = new Request('https://shukka.test/api/v1/apps/acme', {
      headers: { authorization: `Bearer ${plaintext}` },
    })
    expect((await auth.requireAppActor(keyReq, 'acme')).via).toBe('key')
    await expect(auth.requireAppActor(keyReq, 'other')).rejects.toThrow(/not authorized/)

    await expect(auth.requireSessionApp(keyReq, 'acme')).rejects.toThrow(/admin session/)
    expect((await auth.requireSessionApp(session, 'acme')).slug).toBe('acme')
    await expect(auth.requireSessionApp(session, 'missing')).rejects.toThrow(/not found/)
  })
})

describe('api keys', () => {
  beforeEach(async () => {
    await db.delete(apps).run()
  })

  it('authorizes the bound app and rejects any other', async () => {
    const acme = await makeApp('acme')
    const other = await makeApp('other')
    const { plaintext } = await keyFor(acme.id)

    expect((await auth.authenticateApiKey(bearer(plaintext), 'acme')).id).toBe(acme.id)
    await expect(auth.authenticateApiKey(bearer(plaintext), other.slug)).rejects.toThrow(/not authorized/)
  })

  it('never stores the plaintext key', async () => {
    const app = await makeApp('acme')
    const { plaintext, row } = await keyFor(app.id)
    expect(row.hash).not.toBe(plaintext)
    expect(row.hint.length).toBeLessThan(plaintext.length)
    expect((await db.select().from(apiKeys).all()).some((key) => key.hash === plaintext)).toBe(false)
  })

  it('rejects a revoked key immediately', async () => {
    const app = await makeApp('acme')
    const { plaintext, row } = await keyFor(app.id)
    await db.update(apiKeys).set({ revokedAt: Math.floor(Date.now() / 1000) }).run()
    expect(row.revokedAt).toBeNull()
    await expect(auth.authenticateApiKey(bearer(plaintext), 'acme')).rejects.toThrow(/Invalid or revoked/)
  })

  it('rejects a missing or malformed authorization header', async () => {
    await expect(auth.authenticateApiKey(new Request('https://shukka.test/'))).rejects.toThrow(/Missing Bearer/)
    await expect(auth.authenticateApiKey(bearer('shk_nonsense'))).rejects.toThrow(/Invalid or revoked/)
  })

  it('records last use', async () => {
    const app = await makeApp('acme')
    const { plaintext, row } = await keyFor(app.id)
    await auth.authenticateApiKey(bearer(plaintext), 'acme')
    expect((await db.select().from(apiKeys).all()).find((key) => key.id === row.id)?.lastUsedAt).toBeTypeOf('number')
  })

  it('deletes only revoked keys', async () => {
    const app = await makeApp('acme')
    const { row } = await keyFor(app.id)

    // A live key cannot be hard-deleted.
    await expect(appsServer.deleteApiKey(app.id, row.id)).rejects.toThrow(/Only revoked/)
    expect((await db.select().from(apiKeys).all()).some((key) => key.id === row.id)).toBe(true)

    // Once revoked, it can be deleted.
    await appsServer.revokeApiKey(app.id, row.id)
    await appsServer.deleteApiKey(app.id, row.id)
    expect((await db.select().from(apiKeys).all()).some((key) => key.id === row.id)).toBe(false)
  })
})

describe('login rate limit', () => {
  const previousTrustProxy = process.env.SHUKKA_TRUST_PROXY

  beforeEach(async () => {
    await db.delete(admin).run()
    await db.delete(sessions).run()
    resetRateLimitForTests()
    delete process.env.SHUKKA_TRUST_PROXY
    await auth.initializeAdmin('correct horse battery')
  })

  afterEach(() => {
    if (previousTrustProxy === undefined) delete process.env.SHUKKA_TRUST_PROXY
    else process.env.SHUKKA_TRUST_PROXY = previousTrustProxy
  })

  async function postLogin(password: string, headers: Record<string, string> = {}) {
    const POST = routeHandler(loginRoute.Route, 'POST')
    return POST({
      request: new Request('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({ password }),
      }),
      params: {},
    })
  }

  it('returns 429 on the 11th failed login from the same IP', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postLogin('wrong')
      expect(response.status).toBe(401)
    }
    const limited = await postLogin('wrong')
    expect(limited.status).toBe(429)
    await expect(limited.json()).resolves.toMatchObject({
      error: 'rate_limited',
      message: expect.any(String),
    })
  })

  it('accepts the correct password after the limiter is reset', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await postLogin('wrong')).status).toBe(401)
    }
    resetRateLimitForTests()
    const response = await postLogin('correct horse battery')
    expect(response.status).toBe(200)
  })

  it('accepts the correct password before 10 failures', async () => {
    const response = await postLogin('correct horse battery')
    expect(response.status).toBe(200)
  })

  it('ignores forwarding headers unless SHUKKA_TRUST_PROXY is set', async () => {
    for (let i = 0; i < 10; i++) {
      const response = await postLogin('wrong', { 'x-forwarded-for': `1.0.0.${i}` })
      expect(response.status).toBe(401)
    }
    const limited = await postLogin('wrong', { 'x-forwarded-for': '9.9.9.9' })
    expect(limited.status).toBe(429)
    expect(isLimited(clientIp(new Request('http://localhost/', { headers: { 'x-forwarded-for': '203.0.113.1' } })))).toBe(
      true,
    )
  })

  it('keys on the rightmost X-Forwarded-For hop when SHUKKA_TRUST_PROXY is set', async () => {
    process.env.SHUKKA_TRUST_PROXY = '1'
    const proxied = (xff: string) =>
      new Request('http://localhost/', { headers: { 'x-forwarded-for': xff } })

    expect(clientIp(proxied('attacker, 10.0.0.9'))).toBe('10.0.0.9')

    for (let i = 0; i < 10; i++) {
      const response = await postLogin('wrong', { 'x-forwarded-for': 'attacker, 10.0.0.9' })
      expect(response.status).toBe(401)
    }
    expect((await postLogin('wrong', { 'x-forwarded-for': 'other, 10.0.0.9' })).status).toBe(429)
    expect((await postLogin('wrong', { 'x-forwarded-for': 'attacker, 10.0.0.8' })).status).toBe(401)
  })

  it('limits every key after the global failure backstop', () => {
    process.env.SHUKKA_TRUST_PROXY = '1'
    for (let i = 0; i < 101; i++) {
      recordFailure(`203.0.113.${i}`)
    }
    recordSuccess('203.0.113.0')
    expect(isLimited('198.51.100.1')).toBe(true)
  })
})
