import { createFileRoute } from '@tanstack/react-router'
import { handle, textParam } from '~/lib/errors.ts'
import { channelRelease } from '~/server/channel-release.ts'

/**
 * Public, unauthenticated release manifest — same trust model and error
 * envelope as the update feed:
 * /api/v1/apps/{appSlug}/channels/{channel}/release
 */
export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/release')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const result = await channelRelease(
          textParam(params, 'appSlug'),
          textParam(params, 'channel'),
          new URL(request.url).origin,
        )
        return Response.json(result, { headers: { 'cache-control': 'no-store' } })
      }),
    },
  },
})
