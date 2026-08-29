import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAppActor } from '~/lib/auth.ts'
import { ShukkaError, handle, textParam } from '~/lib/errors.ts'
import { updateNotesConfig } from '~/server/release-notes.ts'

const notesConfigSchema = z.object({
  enabled: z.boolean(),
  locales: z.array(z.string().min(1)),
  fallbackLocale: z.string().min(1),
})

/** Dedicated save path: never touches S3 settings, so no storage probe (ADR: release-log). */
export const Route = createFileRoute('/api/v1/apps/$appSlug/notes-config')({
  server: {
    handlers: {
      PUT: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = notesConfigSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid notes config payload', parsed.error.issues)
        return Response.json({ releaseLog: await updateNotesConfig(app.id, parsed.data) })
      }),
    },
  },
})
