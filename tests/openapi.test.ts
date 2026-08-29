import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './setup-db.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const { db } = await import('~/db/index.ts')
const { admin, sessions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const openapiRoute = await import('~/routes/api/v1/openapi[.]json.ts')

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

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('GET /api/v1/openapi.json', () => {
  beforeEach(async () => {
    await db.delete(admin).run()
    await db.delete(sessions).run()
    await auth.initializeAdmin('correct horse battery')
  })

  it('rejects an unauthenticated request', async () => {
    const GET = routeHandler(openapiRoute.Route, 'GET')
    const res = await GET({
      request: new Request('https://shukka.test/api/v1/openapi.json'),
      params: {},
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('returns the OpenAPI document for a session', async () => {
    const token = await auth.login('correct horse battery')
    const GET = routeHandler(openapiRoute.Route, 'GET')
    const res = await GET({
      request: new Request('https://shukka.test/api/v1/openapi.json', {
        headers: { cookie: `${auth.SESSION_COOKIE}=${token}` },
      }),
      params: {},
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(body.openapi).toBe('3.1.0')
    expect(body.paths['/api/v1/apps/{appSlug}']).toBeTruthy()
    expect(body.paths['/api/v1/upload/init']).toBeTruthy()
  })
})

describe('in-app ReDoc', () => {
  it('has no /docs route or HTML renderer', () => {
    expect(existsSync(join(repoRoot, 'src/routes/docs.tsx'))).toBe(false)
    expect(existsSync(join(repoRoot, 'src/server/docs-html.ts'))).toBe(false)
  })
})
