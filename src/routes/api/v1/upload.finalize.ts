import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authenticateApiKey } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { finalizeUpload } from '~/server/releases.ts'

const bodySchema = z.object({
  uploadId: z.string().min(1),
  app: z.string().optional(),
  release: z.boolean().optional(),
})

export const Route = createFileRoute('/api/v1/upload/finalize')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          throw new ShukkaError('invalid_request', 'Invalid finalize payload', parsed.error.issues)
        }
        const app = await authenticateApiKey(request, parsed.data.app)
        return Response.json(await finalizeUpload(app, parsed.data.uploadId, { release: parsed.data.release }))
      }),
    },
  },
})
