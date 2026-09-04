import { createFileRoute } from '@tanstack/react-router'
import { authenticateApiKey } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { uploadFinalizeBodySchema } from '~/server/api-schemas.ts'
import { finalizeUpload } from '~/server/releases.ts'

export const Route = createFileRoute('/api/v1/upload/finalize')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const parsed = uploadFinalizeBodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          throw new ShukkaError('invalid_request', 'Invalid finalize payload', parsed.error.issues)
        }
        const app = await authenticateApiKey(request, parsed.data.app)
        return Response.json(await finalizeUpload(app, parsed.data.uploadId, { release: parsed.data.release }))
      }),
    },
  },
})
