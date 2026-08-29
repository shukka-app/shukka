import { createFileRoute } from '@tanstack/react-router'
import { handle, textParam } from '~/lib/errors.ts'
import { serveFeedRequest } from '~/server/feed.ts'

/** Channel-root feed (Tauri latest.json / Sparkle appcast). Same as the named document. */
export const Route = createFileRoute('/api/update/$appSlug/$channel')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        return serveFeedRequest(request, textParam(params, 'appSlug'), textParam(params, 'channel'), '')
      }),
    },
  },
})
