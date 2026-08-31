import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor } from '~/lib/auth.ts'
import { handle, textParam } from '~/lib/errors.ts'
import { deleteVersionByName } from '~/server/releases.ts'

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/versions/$version')({
  server: {
    handlers: {
      DELETE: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        await deleteVersionByName(app, textParam(params, 'channel'), textParam(params, 'version'))
        return Response.json({ ok: true })
      }),
    },
  },
})
