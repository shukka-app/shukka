import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAppActor } from '~/lib/auth.ts'
import { ShukkaError, handle, safeDecodeURIComponent, textParam } from '~/lib/errors.ts'
import { getVersion } from '~/server/channels.ts'
import { deleteNote, upsertNote } from '~/server/release-notes.ts'

const noteSchema = z.object({ markdown: z.string().min(1) })

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/versions/$version/notes/$locale')({
  server: {
    handlers: {
      PUT: handle(async ({ request, params }) => {
        const { app } = requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = noteSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid note payload', parsed.error.issues)
        const version = getVersion(app.id, textParam(params, 'channel'), textParam(params, 'version'))
        const locale = safeDecodeURIComponent(textParam(params, 'locale'))
        if (locale === null) throw new ShukkaError('invalid_request', 'Malformed locale in URL')
        const note = upsertNote(app.id, version.id, locale, parsed.data.markdown)
        return Response.json({ note })
      }),
      DELETE: handle(async ({ request, params }) => {
        const { app } = requireAppActor(request, textParam(params, 'appSlug'))
        const version = getVersion(app.id, textParam(params, 'channel'), textParam(params, 'version'))
        const locale = safeDecodeURIComponent(textParam(params, 'locale'))
        if (locale === null) throw new ShukkaError('invalid_request', 'Malformed locale in URL')
        deleteNote(app.id, version.id, locale)
        return Response.json({ ok: true })
      }),
    },
  },
})
