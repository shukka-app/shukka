import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAppActor } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { createChannel, listChannels } from '~/server/channels.ts'

const bodySchema = z.object({ name: z.string().min(1) })

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        return Response.json({ channels: await listChannels(app.id) })
      }),
      POST: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Channel name is required')
        return Response.json({ channel: await createChannel(app.id, parsed.data.name) }, { status: 201 })
      }),
    },
  },
})
