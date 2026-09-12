import { createFileRoute } from '@tanstack/react-router'
import { clearSessionCookieHeader, destroySession, readSessionCookie } from '~/lib/auth.ts'
import { handle } from '~/lib/errors.ts'

export const Route = createFileRoute('/api/admin/logout')({
  server: {
    handlers: {
      POST: handle(async ({ request }) => {
        await destroySession(readSessionCookie(request))
        return Response.json({ ok: true }, { headers: { 'set-cookie': clearSessionCookieHeader(request) } })
      }),
    },
  },
})
