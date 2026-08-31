import './setup-db.ts'
import { describe, expect, it, vi } from 'vitest'

const { db } = await import('~/db/index.ts')
const { checkHealth } = await import('~/server/health.ts')
const healthRoute = await import('~/routes/api/health.ts')

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

describe('checkHealth', () => {
  it('reports ok when SQLite responds', async () => {
    const report = await checkHealth()
    expect(report).toEqual({ status: 'ok', db: 'ok', httpStatus: 200 })
  })

  it('reports degraded when the db query throws', async () => {
    const dbModule = await import('~/db/index.ts')
    const spy = vi.spyOn(dbModule.db, 'run').mockImplementation(() => {
      throw new Error('database is locked')
    })
    try {
      expect(await checkHealth()).toEqual({ status: 'degraded', db: 'down', httpStatus: 503 })
    } finally {
      spy.mockRestore()
    }
    // sanity: real db works again after restore
    expect((await checkHealth()).status).toBe('ok')
  })
})

describe('GET /api/health', () => {
  it('returns 200 ok without any auth or cookie', async () => {
    const GET = routeHandler(healthRoute.Route, 'GET')
    const res = await GET({ request: new Request('https://shukka.test/api/health'), params: {} })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'ok', db: 'ok' })
  })

  it('returns 503 degraded when SQLite is down', async () => {
    const spy = vi.spyOn(db, 'run').mockImplementation(() => {
      throw new Error('database is locked')
    })
    try {
      const GET = routeHandler(healthRoute.Route, 'GET')
      const res = await GET({ request: new Request('https://shukka.test/api/health'), params: {} })
      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ status: 'degraded', db: 'down' })
    } finally {
      spy.mockRestore()
    }
  })
})
