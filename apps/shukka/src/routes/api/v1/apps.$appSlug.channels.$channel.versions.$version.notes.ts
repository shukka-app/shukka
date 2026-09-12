import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor } from '~/lib/auth.ts'
import { handle, textParam } from '~/lib/errors.ts'
import { getVersion } from '~/server/channels.ts'
import { listNotes } from '~/server/release-notes.ts'

/** Every locale's note for one version — the editing page's read model. */
export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/versions/$version/notes')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const version = await getVersion(app.id, textParam(params, 'channel'), textParam(params, 'version'))
        return Response.json({ notes: await listNotes(app.id, version.id) })
      }),
    },
  },
})
