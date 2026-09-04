import { createMiddleware } from '@tanstack/react-start'
import { ShukkaError, jsonError } from '~/lib/errors.ts'

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get('content-type') ?? '').includes('text/html')
}

/** Unmatched /api paths fall through to the HTML app router; turn that into the API envelope. */
export function apiNotFoundResponse(): Response {
  return jsonError(new ShukkaError('not_found', 'Not found'))
}

/**
 * `/api` layout middleware. Start still SSRs HTML when no server handler matches
 * (unknown path or unimplemented method). Throw that as an HTTP exception so
 * clients get `{ error: "not_found" }` instead of a page.
 */
export const apiNotFoundMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const result = await next()
    if (isHtmlResponse(result.response)) throw apiNotFoundResponse()
    return result
  } catch (error) {
    if (error instanceof Response) throw error
    throw jsonError(error)
  }
})
