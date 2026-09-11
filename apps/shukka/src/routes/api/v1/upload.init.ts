import { createFileRoute } from '@tanstack/react-router'
import { authenticateApiKey } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { uploadInitBodySchema } from '~/server/api-schemas.ts'
import { initUpload } from '~/server/releases.ts'

export const Route = createFileRoute('/api/v1/upload/init')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const parsed = uploadInitBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          throw new ShukkaError('invalid_request', 'Invalid upload init payload', parsed.error.issues)
        }
        const app = await authenticateApiKey(request, parsed.data.app)
        return Response.json(await initUpload(app, parsed.data))
      }),
    },
  },
})
