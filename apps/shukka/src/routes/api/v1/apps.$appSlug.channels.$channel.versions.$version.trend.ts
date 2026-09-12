import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor } from '~/lib/auth.ts'
import { handle, textParam } from '~/lib/errors.ts'
import { getVersion } from '~/server/channels.ts'
import { versionTrend } from '~/server/hits.ts'

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/versions/$version/trend')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const version = await getVersion(app.id, textParam(params, 'channel'), textParam(params, 'version'))
        return Response.json(await versionTrend(app.id, version.id))
      }),
    },
  },
})
