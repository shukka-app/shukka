import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { changePassword, requireAdmin, sessionCookieHeader } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'

const bodySchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) })

export const Route = createFileRoute('/api/admin/password')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        await requireAdmin(request)
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'New password must be at least 8 characters')
        const token = await changePassword(parsed.data.currentPassword, parsed.data.newPassword)
        return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookieHeader(token, request) } })
      }),
    },
  },
})
