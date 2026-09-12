import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAdmin } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { verifyWritable } from '~/lib/storage.ts'

const storageTestSchema = z.object({
  s3Endpoint: z.string().trim().min(1).nullable().default(null),
  s3Region: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3Prefix: z.string().default(''),
  s3AccessKeyId: z.string().min(1),
  s3SecretAccessKey: z.string().min(1),
  s3ForcePathStyle: z.boolean().default(false),
})

export const Route = createFileRoute('/api/admin/storage/test')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        await requireAdmin(request)
        const parsed = storageTestSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid storage test payload', parsed.error.issues)
        await verifyWritable({
          endpoint: parsed.data.s3Endpoint,
          region: parsed.data.s3Region,
          bucket: parsed.data.s3Bucket,
          prefix: parsed.data.s3Prefix,
          accessKeyId: parsed.data.s3AccessKeyId,
          secretAccessKey: parsed.data.s3SecretAccessKey,
          forcePathStyle: parsed.data.s3ForcePathStyle,
        })
        return Response.json({ ok: true })
      }),
    },
  },
})
