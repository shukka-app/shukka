import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './setup-db.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const { db } = await import('~/db/index.ts')
const { admin, sessions } = await import('~/db/schema.ts')
const auth = await import('~/lib/auth.ts')
const { openApiDocument } = await import('~/server/openapi.ts')
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
    const body = (await res.json()) as { openapi: string; info: { description: string }; paths: Record<string, unknown> }
    expect(body.openapi).toBe('3.1.0')
    expect(body.info.description).not.toMatch(/[\u4e00-\u9fff]/)
    expect(body.paths['/api/v1/apps/{appSlug}']).toBeTruthy()
    expect(body.paths['/api/v1/upload/init']).toBeTruthy()
  })
})

describe('openApiDocument locales', () => {
  const en = openApiDocument('https://shukka.test')
  const zh = openApiDocument('https://shukka.test', 'zh')

  it('defaults to English narrative', () => {
    expect(en.info.description).toBe(openApiDocument('https://shukka.test', 'en').info.description)
    expect(en.info.description).toMatch(/API key/)
    expect(en.info.description).not.toMatch(/[\u4e00-\u9fff]/)
    expect(en.tags[0]?.name).toBe('App')
  })

  it('emits Chinese narrative for locale zh', () => {
    expect(zh.info.description).toMatch(/[\u4e00-\u9fff]/)
    expect(zh.tags[0]?.name).toBe('应用')
    expect(zh.paths['/api/v1/apps/{appSlug}'].get.summary).toMatch(/[\u4e00-\u9fff]/)
  })

  it('keeps the same paths and methods across locales', () => {
    expect(Object.keys(zh.paths)).toEqual(Object.keys(en.paths))
    for (const path of Object.keys(en.paths)) {
      expect(Object.keys(zh.paths[path as keyof typeof zh.paths])).toEqual(
        Object.keys(en.paths[path as keyof typeof en.paths]),
      )
    }
  })
})

describe('openApiDocument schemas', () => {
  const doc = openApiDocument('https://shukka.test')

  it('gives every 2xx JSON response a schema', () => {
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> }>)) {
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (!status.startsWith('2') || status === '204') continue
          const json = response.content?.['application/json']
          expect(json?.schema, `${method.toUpperCase()} ${path} ${status}`).toBeTruthy()
        }
      }
    }
  })

  it('documents upload init and app detail response fields', () => {
    const init = doc.paths['/api/v1/upload/init'].post.responses['200'].content['application/json'].schema as {
      required?: string[]
      properties?: Record<string, unknown>
    }
    expect(init.required).toEqual(expect.arrayContaining(['uploadId', 'expiresAt', 'files']))
    expect(init.properties?.files).toBeTruthy()

    const detail = doc.paths['/api/v1/apps/{appSlug}'].get.responses['200'].content['application/json'].schema as {
      required?: string[]
      properties?: Record<string, { properties?: Record<string, unknown> }>
    }
    expect(detail.required).toEqual(expect.arrayContaining(['app', 'channels']))
    expect(detail.properties?.app?.properties?.slug).toBeTruthy()
    expect(detail.properties?.keys).toBeTruthy()
  })
})

describe('in-app ReDoc', () => {
  it('has no /docs route or HTML renderer', () => {
    expect(existsSync(join(repoRoot, 'src/routes/docs.tsx'))).toBe(false)
    expect(existsSync(join(repoRoot, 'src/server/docs-html.ts'))).toBe(false)
  })
})
