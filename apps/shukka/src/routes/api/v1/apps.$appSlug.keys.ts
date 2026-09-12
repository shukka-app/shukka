import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireSessionApp } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { createApiKey, listApiKeys } from '~/server/apps.ts'

const bodySchema = z.object({ name: z.string().min(1) })

export const Route = createFileRoute('/api/v1/apps/$appSlug/keys')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const app = await requireSessionApp(request, textParam(params, 'appSlug'))
        return Response.json({ keys: await listApiKeys(app.id) })
      }),
      POST: handle(async ({ request, params }) => {
        const app = await requireSessionApp(request, textParam(params, 'appSlug'))
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Key name is required')

        const { key, plaintext } = await createApiKey(app.id, parsed.data.name)
        return Response.json({ key, plaintext }, { status: 201 })
      }),
    },
  },
})
