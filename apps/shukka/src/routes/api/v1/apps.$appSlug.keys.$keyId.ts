import { createFileRoute } from '@tanstack/react-router'
import { requireSessionApp } from '~/lib/auth.ts'
import { handle, numericParam, textParam } from '~/lib/errors.ts'
import { deleteApiKey, revokeApiKey } from '~/server/apps.ts'

export const Route = createFileRoute('/api/v1/apps/$appSlug/keys/$keyId')({
  server: {
    handlers: {
      DELETE: handle(async ({ request, params }) => {
        const app = await requireSessionApp(request, textParam(params, 'appSlug'))
        const keyId = numericParam(params, 'keyId')
        const mode = new URL(request.url).searchParams.get('mode')
        if (mode === 'delete') await deleteApiKey(app.id, keyId)
        else await revokeApiKey(app.id, keyId)
        return Response.json({ ok: true })
      }),
    },
  },
})
