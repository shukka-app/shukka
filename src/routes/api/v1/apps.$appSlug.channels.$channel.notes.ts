import { createFileRoute } from '@tanstack/react-router'
import { handle, textParam } from '~/lib/errors.ts'
import { publicNotes } from '~/server/release-notes.ts'

/**
 * Public, unauthenticated release-notes read — same trust model and error
 * envelope as the update feed:
 * /api/v1/apps/{appSlug}/channels/{channel}/notes?from&to&locale
 */
export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/notes')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const search = new URL(request.url).searchParams
        const result = await publicNotes(textParam(params, 'appSlug'), textParam(params, 'channel'), {
          from: search.get('from') || null,
          to: search.get('to') || null,
          locale: search.get('locale') || null,
        })
        return Response.json(result, { headers: { 'cache-control': 'no-store' } })
      }),
    },
  },
})
