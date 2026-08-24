import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor, requireSessionApp } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { changedProtectedFields, deleteApp, updateApp } from '~/server/apps.ts'
import { appDetailBySlug, publicApp } from '~/server/dashboard.ts'
import { appInputSchema } from '~/routes/api/admin/apps.ts'

export const Route = createFileRoute('/api/v1/apps/$appSlug')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const slug = textParam(params, 'appSlug')
        const { via } = requireAppActor(request, slug)
        return Response.json(appDetailBySlug(slug, new URL(request.url).origin, { includeKeys: via === 'session' }))
      }),
      PATCH: handle(async ({ request, params }) => {
        const { app, via } = requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = appInputSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid app payload', parsed.error.issues)
        if (via === 'key') {
          const forbidden = changedProtectedFields(app, parsed.data)
          if (forbidden.length > 0) {
            throw new ShukkaError('forbidden', 'API keys may only change the app name', forbidden)
          }
        }
        return Response.json({ app: publicApp(await updateApp(app.id, parsed.data)) })
      }),
      DELETE: handle(async ({ request, params }) => {
        const app = requireSessionApp(request, textParam(params, 'appSlug'))
        await deleteApp(app.id)
        return Response.json({ ok: true })
      }),
    },
  },
})
