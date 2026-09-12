import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor } from '~/lib/auth.ts'
import { handle, textParam } from '~/lib/errors.ts'
import { presignVersionArtifact } from '~/server/releases.ts'

export const Route = createFileRoute(
  '/api/v1/apps/$appSlug/channels/$channel/versions/$version/artifacts/$filename',
)({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const url = await presignVersionArtifact(
          app,
          textParam(params, 'channel'),
          textParam(params, 'version'),
          textParam(params, 'filename'),
        )
        return new Response(null, {
          status: 302,
          headers: { location: url, 'cache-control': 'no-store' },
        })
      }),
    },
  },
})
