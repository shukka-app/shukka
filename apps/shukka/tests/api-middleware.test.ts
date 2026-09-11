import { describe, expect, it } from 'vitest'
import { apiNotFoundMiddleware, apiNotFoundResponse } from '~/lib/api-middleware.ts'
import { Route } from '~/routes/api.ts'

type MiddlewareServer = (opts: {
  request: Request
  pathname: string
  context: undefined
  handlerType: 'router'
  next: () => Promise<{ request: Request; pathname: string; context: undefined; response: Response }>
}) => Promise<{ response: Response } | Response>

function middlewareServer(): MiddlewareServer {
  const server = apiNotFoundMiddleware.options.server
  if (!server) throw new Error('middleware has no server fn')
  return server as MiddlewareServer
}

async function runMiddleware(response: Response): Promise<Response> {
  try {
    const result = await middlewareServer()({
      request: new Request('https://shukka.test/api/missing'),
      pathname: '/api/missing',
      context: undefined,
      handlerType: 'router',
      next: async () => ({
        request: new Request('https://shukka.test/api/missing'),
        pathname: '/api/missing',
        context: undefined,
        response,
      }),
    })
    if (result instanceof Response) return result
    return result.response
  } catch (error) {
    if (error instanceof Response) return error
    throw error
  }
}

describe('apiNotFoundMiddleware', () => {
  it('is attached to the /api layout so unmatched children inherit it', () => {
    expect(Route.options.server?.middleware).toEqual([apiNotFoundMiddleware])
  })

  it('throws the API not_found envelope when Start falls through to HTML', async () => {
    const expected = apiNotFoundResponse()
    const response = await runMiddleware(
      new Response('<html>Not Found</html>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    )
    expect(response.status).toBe(expected.status)
    expect(await response.json()).toEqual({ error: 'not_found', message: 'Not found' })
  })

  it('leaves real API responses alone', async () => {
    const payload = { status: 'ok', db: 'ok' }
    const response = await runMiddleware(Response.json(payload))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(payload)
  })

  it('turns unhandled handler errors into the JSON envelope', async () => {
    try {
      await middlewareServer()({
        request: new Request('https://shukka.test/api/boom'),
        pathname: '/api/boom',
        context: undefined,
        handlerType: 'router',
        next: async () => {
          throw new Error('boom')
        },
      })
      throw new Error('expected middleware to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(Response)
      const response = error as Response
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'internal_error', message: 'Unexpected error' })
    }
  })
})
