import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAppActor } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { deleteChannelByName, setCurrentVersion } from '~/server/channels.ts'

const patchSchema = z.object({ currentVersion: z.string().min(1).nullable() })

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel')({
  server: {
    handlers: {
      PATCH: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = patchSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'currentVersion is required')
        await setCurrentVersion(app.id, textParam(params, 'channel'), parsed.data.currentVersion)
        return Response.json({ ok: true })
      }),
      DELETE: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        await deleteChannelByName(app, textParam(params, 'channel'))
        return Response.json({ ok: true })
      }),
    },
  },
})
