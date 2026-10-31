import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import './setup-db.ts'
import { resetStore } from './store-reset.ts'
import { beforeEach, describe, expect, it } from 'vitest'

const auth = await import('~/lib/auth.ts')
const { openApiDocument } = await import('~/server/openapi.ts')
const { toOpenApi30 } = await import('~/server/openapi-30.ts')
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
    await resetStore()
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

  it('keeps operation summaries as short titles and puts details in description', () => {
    type Operation = { summary?: string; description?: string }
    const check = (doc: typeof en, label: string) => {
      for (const [path, methods] of Object.entries(doc.paths)) {
        for (const [method, operation] of Object.entries(methods as Record<string, Operation>)) {
          const summary = operation.summary ?? ''
          expect(summary.length, `${label} ${method.toUpperCase()} ${path}`).toBeLessThanOrEqual(40)
          expect(summary, `${label} ${method.toUpperCase()} ${path}`).not.toMatch(/\. /)
          expect(summary, `${label} ${method.toUpperCase()} ${path}`).not.toMatch(/\.$/)
        }
      }
    }
    check(en, 'en')
    check(zh, 'zh')

    expect(en.paths['/api/v1/upload/init'].post.description).toMatch(/Electron/)
    expect(zh.paths['/api/v1/upload/init'].post.description).toMatch(/Electron/)
    expect(en.paths['/api/update/{appSlug}/{channel}'].get.description).toMatch(/Tauri/)
    expect(en.paths['/api/update/{appSlug}/{channel}/{filename}'].get.description).toMatch(/302/)
    expect(en.paths['/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/metadata'].put.description).toMatch(
      /16 KiB/,
    )
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

  it('describes custom metadata as an object without document-root recursive refs', () => {
    const operation = doc.paths['/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/metadata']
    const response = resolve<{ properties: { metadata: { type: string; additionalProperties: boolean } } }>(
      doc,
      operation.get.responses['200'].content['application/json'].schema,
    )
    expect(response.properties.metadata).toMatchObject({ type: 'object', additionalProperties: true })
    expect(JSON.stringify(doc)).not.toContain('#/$defs/')
    expect(operation.get.security).toContainEqual({})
    const finalize = doc.paths['/api/v1/upload/finalize'].post.requestBody.content['application/json'].schema
    expect(JSON.stringify(finalize)).not.toContain('#/$defs/')
  })

  it('names every JSON request and response through components.schemas', () => {
    type Operation = {
      requestBody?: { content?: Record<string, { schema?: unknown }> }
      responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>
    }
    const used = new Set<string>()

    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, Operation | unknown[]>)) {
        if (!HTTP_METHODS.includes(method)) continue
        const { requestBody, responses } = operation as Operation

        const collect = (schema: unknown, label: string) => {
          const ref = (schema as { $ref?: unknown }).$ref
          expect(typeof ref, label).toBe('string')
          const name = String(ref).replace('#/components/schemas/', '')
          expect(doc.components.schemas[name as keyof typeof doc.components.schemas], label).toBeTruthy()
          used.add(name)
        }

        const body = requestBody?.content?.['application/json']?.schema
        if (body) collect(body, `${method.toUpperCase()} ${path} request body`)
        for (const [status, response] of Object.entries(responses ?? {})) {
          const schema = response.content?.['application/json']?.schema
          if (schema) collect(schema, `${method.toUpperCase()} ${path} ${status}`)
        }
      }
    }

    expect(used.size).toBeGreaterThanOrEqual(20)
    for (const name of Object.keys(doc.components.schemas)) {
      expect(used.has(name), `component ${name} is never referenced`).toBe(true)
    }
  })

  it('documents upload init and app detail response fields', () => {
    const init = resolve<{ required?: string[]; properties?: Record<string, unknown> }>(
      doc,
      doc.paths['/api/v1/upload/init'].post.responses['200'].content['application/json'].schema,
    )
    expect(init.required).toEqual(expect.arrayContaining(['uploadId', 'expiresAt', 'files']))
    expect(init.properties?.files).toBeTruthy()

    const detail = resolve<{
      required?: string[]
      properties?: Record<string, { properties?: Record<string, unknown> }>
    }>(doc, doc.paths['/api/v1/apps/{appSlug}'].get.responses['200'].content['application/json'].schema)
    expect(detail.required).toEqual(expect.arrayContaining(['app', 'channels']))
    expect(detail.properties?.app?.properties?.slug).toBeTruthy()
    expect(detail.properties?.keys).toBeTruthy()
  })
})

/**
 * The operationId contract. Generated SDKs name their methods from these, so a
 * rename is a breaking change: this table must change deliberately, never as a
 * side effect of renaming a path.
 */
const EXPECTED_OPERATION_IDS: Record<string, string> = {
  'GET /api/v1/apps/{appSlug}': 'getApp',
  'PATCH /api/v1/apps/{appSlug}': 'updateApp',
  'GET /api/v1/apps/{appSlug}/channels': 'listChannels',
  'POST /api/v1/apps/{appSlug}/channels': 'createChannel',
  'PATCH /api/v1/apps/{appSlug}/channels/{channel}': 'setCurrentVersion',
  'DELETE /api/v1/apps/{appSlug}/channels/{channel}': 'deleteChannel',
  'GET /api/v1/apps/{appSlug}/channels/{channel}/trend': 'getChannelTrend',
  'DELETE /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}': 'deleteVersion',
  'GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/artifacts/{filename}': 'getArtifact',
  'GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/metadata': 'getReleaseMetadata',
  'PUT /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/metadata': 'replaceReleaseMetadata',
  'GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend': 'getVersionTrend',
  'GET /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes': 'getEditorNotes',
  'PUT /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes/{locale}': 'upsertNote',
  'DELETE /api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes/{locale}': 'deleteNote',
  'GET /api/v1/apps/{appSlug}/channels/{channel}/notes': 'listPublicNotes',
  'PUT /api/v1/apps/{appSlug}/notes-config': 'saveNotesConfig',
  'POST /api/v1/upload/init': 'initUpload',
  'POST /api/v1/upload/finalize': 'finalizeUpload',
  'GET /api/update/{appSlug}/{channel}': 'getChannelFeed',
  'GET /api/update/{appSlug}/{channel}/{filename}': 'getFeedFile',
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']

/** Follows one `$ref` into `components.schemas`; component schemas are one level deep by design. */
function resolve<T>(doc: { components: { schemas: Record<string, unknown> } }, schema: unknown): T {
  const ref = (schema as { $ref?: string }).$ref
  if (!ref) return schema as T
  const name = ref.split('/').pop() ?? ''
  const resolved = doc.components.schemas[name]
  if (!resolved) throw new Error(`Unresolved $ref: ${ref}`)
  return resolved as T
}

function operationIds<T extends { paths: Record<string, object> }>(doc: T) {
  const byRoute: Record<string, unknown> = {}
  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
      if (!HTTP_METHODS.includes(method)) continue
      byRoute[`${method.toUpperCase()} ${path}`] = (operation as { operationId?: unknown }).operationId
    }
  }
  return byRoute
}

describe('openApiDocument operationIds', () => {
  const doc = openApiDocument('https://shukka.test')

  it('gives every operation exactly the expected, stable id', () => {
    expect(operationIds(doc)).toEqual(EXPECTED_OPERATION_IDS)
  })

  it('keeps ids unique, lowerCamelCase, and locale-independent', () => {
    const ids = Object.values(operationIds(doc)) as string[]
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z][A-Za-z0-9]*$/)
    expect(operationIds(openApiDocument('https://shukka.test', 'zh'))).toEqual(operationIds(doc))
  })
})

describe('toOpenApi30', () => {
  const doc = openApiDocument('https://shukka.test')
  const doc30 = toOpenApi30(doc)
  const json30 = JSON.stringify(doc30)

  it('declares 3.0.3 and keeps the same operations', () => {
    expect(doc30.openapi).toBe('3.0.3')
    expect(operationIds(doc30)).toEqual(EXPECTED_OPERATION_IDS)
    expect(Object.keys(doc30.paths)).toEqual(Object.keys(doc.paths))
  })

  it('leaves no 3.1-only schema construct behind', () => {
    expect(json30).not.toMatch(/"type":\s*\[/)
    expect(json30).not.toContain('"const"')
    expect(json30).not.toContain('"$defs"')
    expect(json30).not.toContain('"prefixItems"')
    expect(json30).not.toContain('"propertyNames"')
    expect(json30).not.toMatch(/"anyOf":\s*\[[^\]]*"type":\s*"null"/)
  })

  it('rewrites nullable unions as `nullable: true`', () => {
    type Schema = { type?: unknown; nullable?: boolean; anyOf?: unknown }
    const s3Endpoint = resolve<{ properties: { app: { properties: { s3Endpoint: Schema } } } }>(
      doc30,
      doc30.paths['/api/v1/apps/{appSlug}'].get.responses['200'].content['application/json'].schema,
    ).properties.app.properties.s3Endpoint
    expect(s3Endpoint).toEqual({ type: 'string', nullable: true })

    const patchBody = resolve<{ properties: { s3Endpoint: Schema } }>(
      doc30,
      doc30.paths['/api/v1/apps/{appSlug}'].patch.requestBody.content['application/json'].schema,
    ).properties.s3Endpoint
    expect(patchBody).toEqual({ type: 'string', minLength: 1, default: null, nullable: true })
    expect(patchBody.anyOf).toBeUndefined()
  })

  it('rewrites `const` as a single-value enum', () => {
    const schema = resolve<{ properties: Record<string, unknown> }>(
      doc30,
      doc30.paths['/api/v1/apps/{appSlug}/channels/{channel}'].delete.responses['200'].content['application/json']
        .schema,
    )
    expect(schema.properties.ok).toEqual({ type: 'boolean', enum: [true] })
  })

  it('does not mutate the 3.1 document', () => {
    expect(doc.openapi).toBe('3.1.0')
    expect(JSON.stringify(doc)).toMatch(/"type":\s*\[\s*"string",\s*"null"\s*\]/)
  })
})

describe('in-app ReDoc', () => {
  it('has no /docs route or HTML renderer', () => {
    expect(existsSync(join(repoRoot, 'src/routes/docs.tsx'))).toBe(false)
    expect(existsSync(join(repoRoot, 'src/server/docs-html.ts'))).toBe(false)
  })
})
