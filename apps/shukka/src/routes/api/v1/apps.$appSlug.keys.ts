import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { db } from '~/db/index.ts'
import { apiKeys } from '~/db/schema.ts'
import { generateApiKey, requireSessionApp } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { listApiKeys } from '~/server/apps.ts'

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

        const { plaintext, hash, hint } = generateApiKey()
        const [key] = await db.insert(apiKeys).values({ appId: app.id, name: parsed.data.name, hash, hint }).returning()

        return Response.json(
          { key: { id: key.id, name: key.name, hint: key.hint, createdAt: key.createdAt }, plaintext },
          { status: 201 },
        )
      }),
    },
  },
})
