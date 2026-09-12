import { createFileRoute, redirect } from '@tanstack/react-router'
import { getSessionState } from '~/server/session-fn.ts'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSessionState()
    if (!session.initialized) throw redirect({ to: '/setup' })
    if (!session.authenticated) throw redirect({ to: '/login' })
    throw redirect({ to: '/apps' })
  },
})
