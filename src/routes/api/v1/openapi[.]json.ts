import { createFileRoute } from '@tanstack/react-router'
import { requireAdmin } from '~/lib/auth.ts'
import { handle } from '~/lib/errors.ts'
import { openApiDocument } from '~/server/openapi.ts'

/** Machine-readable OpenAPI document — session only. Human docs live in shukka-app/docs. */
export const Route = createFileRoute('/api/v1/openapi.json')({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        requireAdmin(request)
        return Response.json(openApiDocument(new URL(request.url).origin), {
          headers: { 'cache-control': 'no-store' },
        })
      }),
    },
  },
})
