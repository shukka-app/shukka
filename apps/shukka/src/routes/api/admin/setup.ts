import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { initializeAdmin, sessionCookieHeader } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'

const bodySchema = z.object({ password: z.string().min(8) })

export const Route = createFileRoute('/api/admin/setup')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Password must be at least 8 characters')
        const token = await initializeAdmin(parsed.data.password)
        return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookieHeader(token, request) } })
      }),
    },
  },
})
