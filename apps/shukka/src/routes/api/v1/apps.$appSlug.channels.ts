import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { createChannelBodySchema } from '~/server/api-schemas.ts'
import { createChannel, listChannels } from '~/server/channels.ts'

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        return Response.json({ channels: await listChannels(app.id) })
      }),
      POST: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = createChannelBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Channel name is required')
        return Response.json({ channel: await createChannel(app.id, parsed.data.name) }, { status: 201 })
      }),
    },
  },
})
