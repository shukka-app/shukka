import { createFileRoute } from '@tanstack/react-router'
import { requireAppActor } from '~/lib/auth.ts'
import { ShukkaError, handle, safeDecodeURIComponent, textParam } from '~/lib/errors.ts'
import { upsertNoteBodySchema } from '~/server/api-schemas.ts'
import { getVersion } from '~/server/channels.ts'
import { deleteNote, upsertNote } from '~/server/release-notes.ts'

function localeParam(params: Record<string, string | undefined>): string {
  const locale = safeDecodeURIComponent(textParam(params, 'locale'))
  if (locale === null) throw new ShukkaError('invalid_request', 'Invalid locale')
  return locale
}

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/versions/$version/notes/$locale')({
  server: {
    handlers: {
      PUT: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = upsertNoteBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid note payload', parsed.error.issues)
        const version = await getVersion(app.id, textParam(params, 'channel'), textParam(params, 'version'))
        const note = await upsertNote(app.id, version.id, localeParam(params), parsed.data.markdown)
        return Response.json({ note })
      }),
      DELETE: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const version = await getVersion(app.id, textParam(params, 'channel'), textParam(params, 'version'))
        await deleteNote(app.id, version.id, localeParam(params))
        return Response.json({ ok: true })
      }),
    },
  },
})
