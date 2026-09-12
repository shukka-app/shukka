/** Stable machine-readable failure codes for the upload and feed contracts. */
export type ShukkaErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'invalid_request'
  | 'storage_error'
  | 'metadata_error'
  | 'rate_limited'

const statusByCode: Record<ShukkaErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  invalid_request: 400,
  storage_error: 502,
  metadata_error: 422,
  rate_limited: 429,
}

export class ShukkaError extends Error {
  readonly code: ShukkaErrorCode
  readonly status: number
  readonly details?: unknown

  constructor(code: ShukkaErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ShukkaError'
    this.code = code
    this.status = statusByCode[code]
    this.details = details
  }
}

export function jsonError(error: unknown): Response {
  if (error instanceof ShukkaError) {
    return Response.json(
      { error: error.code, message: error.message, details: error.details },
      { status: error.status },
    )
  }
  console.error(error)
  return Response.json({ error: 'internal_error', message: 'Unexpected error' }, { status: 500 })
}

/** The subset of the server-route handler context Shukka handlers use. */
export type HandlerContext = {
  request: Request
  params: Record<string, string | undefined>
}

/** Wraps a server-route handler so typed errors become their documented status codes. */
export function handle(fn: (ctx: HandlerContext) => Promise<Response>) {
  return async (ctx: HandlerContext): Promise<Response> => {
    try {
      return await fn(ctx)
    } catch (error) {
      return jsonError(error)
    }
  }
}

/** Returns null on malformed percent-encoding instead of throwing URIError. */
export function safeDecodeURIComponent(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

/** Route params are typed as possibly-undefined; these narrow them at the boundary. */
export function textParam(params: HandlerContext['params'], name: string): string {
  const value = params[name]
  if (value === undefined) throw new ShukkaError('not_found', `Missing route parameter "${name}"`)
  return value
}

export function numericParam(params: HandlerContext['params'], name: string): number {
  const value = Number(textParam(params, name))
  if (!Number.isInteger(value) || value <= 0) throw new ShukkaError('not_found', 'Resource not found')
  return value
}
