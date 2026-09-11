import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const runtimeState = vi.hoisted(() => ({ cloud: false }))

vi.mock('~/lib/runtime.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/runtime.ts')>()
  return { ...actual, isCloudFunction: () => runtimeState.cloud }
})

const { db } = await import('~/db/index.ts')
const { admin, sessions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const loginRoute = await import('~/routes/api/admin/login.ts')
const { isLimited, recordFailure, resetRateLimitForTests } = await import('~/lib/rate-limit.ts')

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

describe('login rate limit on cloud functions', () => {
  beforeEach(async () => {
    runtimeState.cloud = true
    await db.delete(admin).run()
    await db.delete(sessions).run()
    resetRateLimitForTests()
    await auth.initializeAdmin('correct horse battery')
  })

  async function postLogin(password: string) {
    const POST = routeHandler(loginRoute.Route, 'POST')
    return POST({
      request: new Request('http://localhost:3000/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      }),
      params: {},
    })
  }

  it('never returns rate_limited from this module', async () => {
    for (let i = 0; i < 15; i++) {
      const response = await postLogin('wrong')
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized' })
    }
    expect(isLimited('direct')).toBe(false)
  })

  it('does not accumulate failures while the isolate flag is on', () => {
    for (let i = 0; i < 20; i++) recordFailure('direct')
    expect(isLimited('direct')).toBe(false)
  })
})
