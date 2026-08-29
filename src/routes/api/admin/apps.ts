import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { requireAdmin } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { UPDATER_KINDS } from '~/lib/updater-kind.ts'
import { createApp } from '~/server/apps.ts'
import { appSummaries, publicApp } from '~/server/dashboard.ts'

export const appInputSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  s3Endpoint: z.string().trim().min(1).nullable().default(null),
  s3Region: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3Prefix: z.string().default(''),
  s3AccessKeyId: z.string().min(1),
  s3SecretAccessKey: z.string().min(1).optional(),
  s3ForcePathStyle: z.boolean().default(false),
  updaterKind: z.enum(UPDATER_KINDS).optional(),
})

export const Route = createFileRoute('/api/admin/apps')({
  server: {
    handlers: {
      GET: handle(async ({ request }) => {
        await requireAdmin(request)
        return Response.json({ apps: await appSummaries() })
      }),
      POST: handle(async ({ request }) => {
        await requireAdmin(request)
        const parsed = appInputSchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Invalid app payload', parsed.error.issues)
        return Response.json({ app: publicApp(await createApp(parsed.data)) }, { status: 201 })
      }),
    },
  },
})
