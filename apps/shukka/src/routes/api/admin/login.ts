import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { login, sessionCookieHeader } from '~/lib/auth.ts'
import { ShukkaError, handle } from '~/lib/errors.ts'
import { clientIp, isLimited, recordFailure, recordSuccess } from '~/lib/rate-limit.ts'

const bodySchema = z.object({ password: z.string().min(1) })

export const Route = createFileRoute('/api/admin/login')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        const ip = clientIp(request)
        if (isLimited(ip)) throw new ShukkaError('rate_limited', 'Too many login attempts. Try again later.')
        const parsed = bodySchema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) throw new ShukkaError('invalid_request', 'Password is required')
        try {
          const token = await login(parsed.data.password)
          recordSuccess(ip)
          return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookieHeader(token, request) } })
        } catch (error) {
          if (error instanceof ShukkaError && error.code === 'unauthorized') recordFailure(ip)
          throw error
        }
      }),
    },
  },
})
