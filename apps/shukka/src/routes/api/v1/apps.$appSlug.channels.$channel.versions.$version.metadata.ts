import { createFileRoute } from '@tanstack/react-router'
import { authenticateApiKey, readSessionCookie, requireAppActor, sessionIsValid } from '~/lib/auth.ts'
import { handle, ShukkaError, textParam } from '~/lib/errors.ts'
import { getAppBySlug } from '~/server/apps.ts'
import { releaseMetadataBodySchema } from '~/server/api-schemas.ts'
import { getReleaseMetadata, replaceReleaseMetadata } from '~/server/release-metadata.ts'

export const Route = createFileRoute('/api/v1/apps/$appSlug/channels/$channel/versions/$version/metadata')({
  server: {
    handlers: {
      GET: handle(async ({ request, params }) => {
        const slug = textParam(params, 'appSlug')
        const hasAuthorization = request.headers.has('authorization')
        const app = hasAuthorization ? await authenticateApiKey(request, slug) : await getAppBySlug(slug)
        const authenticated = hasAuthorization || await sessionIsValid(readSessionCookie(request))
        const result = await getReleaseMetadata(
          app.id, textParam(params, 'channel'), textParam(params, 'version'), authenticated,
        )
        return Response.json(result, { headers: { 'cache-control': 'no-store' } })
      }),
      PUT: handle(async ({ request, params }) => {
        const { app } = await requireAppActor(request, textParam(params, 'appSlug'))
        const parsed = releaseMetadataBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          throw new ShukkaError('invalid_request', 'Invalid release metadata', parsed.error.issues)
        }
        const result = await replaceReleaseMetadata(
          app.id, textParam(params, 'channel'), textParam(params, 'version'), parsed.data.metadata,
        )
        return Response.json(result)
      }),
    },
  },
})
