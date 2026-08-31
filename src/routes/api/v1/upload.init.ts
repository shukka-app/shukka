import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { authenticateApiKey } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { initUpload } from '~/server/releases.ts'

const bodySchema = z.object({
  app: z.string().optional(),
  channel: z.string().min(1),
  version: z.string().min(1),
  createChannel: z.boolean().optional(),
  files: z.array(z.object({ filename: z.string().min(1), size: z.number().int().nonnegative().optional() })).min(1),
})

export const Route = createFileRoute('/api/v1/upload/init')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
          throw new ShukkaError('invalid_request', 'Invalid upload init payload', parsed.error.issues)
        }
        const app = await authenticateApiKey(request, parsed.data.app)
        return Response.json(await initUpload(app, parsed.data))
      }),
    },
  },
})
