import { createFileRoute } from '@tanstack/react-router'
import { ShukkaError, handle, safeDecodeURIComponent, textParam } from '~/lib/errors.ts'
import { serveFeedRequest } from '~/server/feed.ts'

/**
 * Public update feed. Document shape follows the app's updater adapter;
 * artifacts 302 to storage. Base URL: /api/update/{appSlug}/{channel}
 */
export const Route = createFileRoute('/api/update/$appSlug/$channel/$')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const filename = safeDecodeURIComponent(params._splat ?? '')
        if (filename === null) throw new ShukkaError('not_found', 'Not found')
        return serveFeedRequest(request, textParam(params, 'appSlug'), textParam(params, 'channel'), filename)
      }),
    },
  },
})
