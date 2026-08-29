import { createFileRoute } from '@tanstack/react-router'
import { checkHealth } from '~/server/health.ts'

/** Public liveness probe for orchestrators / reverse proxies. No auth, no app data. */
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const report = await checkHealth()
        return Response.json(
          { status: report.status, db: report.db },
          { status: report.httpStatus, headers: { 'cache-control': 'no-store' } },
        )
      },
    },
  },
})
