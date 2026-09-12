import { createFileRoute } from '@tanstack/react-router'
import { apiNotFoundMiddleware } from '~/lib/api-middleware.ts'

/** Layout for every `/api/*` server route. Middleware applies even on fuzzy 404 matches. */
export const Route = createFileRoute('/api')({
  server: {
    middleware: [apiNotFoundMiddleware],
  },
})
