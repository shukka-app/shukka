/**
 * OpenAPI 3.0.3 snapshot of the document built by `openApiDocument`.
 *
 * Generators disagree about 3.1: swift-openapi-generator and
 * `@hey-api/openapi-ts` read 3.1 natively; openapi-generator still calls its
 * 3.1 support beta; progenitor rejects anything that is not `3.0.x`. The
 * document only uses three 3.1-only constructs, so this is a schema walk
 * rather than a second spec builder (ADR: openapi-30-snapshot).
 */
import type { openApiDocument } from './openapi.ts'

type Document = ReturnType<typeof openApiDocument>

export type OpenApi30Document = Omit<Document, 'openapi'> & { openapi: '3.0.3' }

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullBranch(value: unknown): boolean {
  return isObject(value) && value.type === 'null'
}

/**
 * Rewrites one schema node in place, then walks its subschemas.
 *
 * 3.1 → 3.0.3:
 *   const: v                        → enum: [v]
 *   type: ['string', 'null']        → type: 'string', nullable: true
 *   anyOf: [{...}, {type: 'null'}]  → {...}, nullable: true
 *   propertyNames                   → dropped (no 3.0 equivalent; string keys are implicit)
 */
function downgradeSchema(schema: JsonObject): void {
  delete schema.propertyNames

  if ('const' in schema && !('enum' in schema)) {
    schema.enum = [schema.const]
    delete schema.const
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((type) => type !== 'null')
    const nullable = types.length !== schema.type.length
    if (types.length === 1) schema.type = types[0]
    else delete schema.type
    if (nullable && types.length > 0) schema.nullable = true
  }

  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf
    const nullBranch = branches.find(isNullBranch)
    const rest = branches.filter((branch) => branch !== nullBranch)
    if (nullBranch && rest.length === 1 && isObject(rest[0])) {
      delete schema.anyOf
      Object.assign(schema, rest[0])
      schema.nullable = true
    }
  }

  if (isObject(schema.properties)) {
    for (const child of Object.values(schema.properties)) {
      if (isObject(child)) downgradeSchema(child)
    }
  }
  if (isObject(schema.items)) downgradeSchema(schema.items)
  if (isObject(schema.additionalProperties)) downgradeSchema(schema.additionalProperties)
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = schema[keyword]
    if (!Array.isArray(branches)) continue
    for (const branch of branches) {
      if (isObject(branch)) downgradeSchema(branch)
    }
  }
}

function downgradeContent(content: unknown): void {
  if (!isObject(content)) return
  for (const mediaType of Object.values(content)) {
    if (isObject(mediaType) && isObject(mediaType.schema)) downgradeSchema(mediaType.schema)
  }
}

function downgradeParameters(parameters: unknown): void {
  if (!Array.isArray(parameters)) return
  for (const parameter of parameters) {
    if (isObject(parameter) && isObject(parameter.schema)) downgradeSchema(parameter.schema)
  }
}

function downgradeOperation(operation: unknown): void {
  if (!isObject(operation)) return
  downgradeParameters(operation.parameters)
  if (isObject(operation.requestBody)) downgradeContent(operation.requestBody.content)
  if (!isObject(operation.responses)) return
  for (const response of Object.values(operation.responses)) {
    if (isObject(response)) downgradeContent(response.content)
  }
}

/** Deep copy of the 3.1 document with only 3.0.3-expressible schemas. */
export function toOpenApi30(doc: Document): OpenApi30Document {
  const next = structuredClone(doc) as unknown as JsonObject
  next.openapi = '3.0.3'

  if (isObject(next.components)) {
    const components = next.components
    if (isObject(components.schemas)) {
      for (const schema of Object.values(components.schemas)) {
        if (isObject(schema)) downgradeSchema(schema)
      }
    }
    downgradeParameters(components.parameters)
  }

  if (isObject(next.paths)) {
    for (const pathItem of Object.values(next.paths)) {
      if (!isObject(pathItem)) continue
      downgradeParameters(pathItem.parameters)
      for (const operation of Object.values(pathItem)) {
        downgradeOperation(operation)
      }
    }
  }

  return next as unknown as OpenApi30Document
}
