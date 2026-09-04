import { createFileRoute } from '@tanstack/react-router'
import { requireAdmin } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { appInputSchema } from '~/server/api-schemas.ts'
import { createApp } from '~/server/apps.ts'
import { appSummaries, publicApp } from '~/server/dashboard.ts'

export const Route = createFileRoute('/api/admin/apps')({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        await requireAdmin(request)
        return Response.json({ apps: await appSummaries() })
      }),
      POST: handle(async ({ request }) => {
        await requireAdmin(request)
        const parsed = appInputSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid app payload', parsed.error.issues)
        return Response.json({ app: publicApp(await createApp(parsed.data)) }, { status: 201 })
      }),
    },
  },
})
