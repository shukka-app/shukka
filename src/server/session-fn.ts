import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { isInitialized, readSessionCookie, sessionIsValid } from '~/lib/auth.ts'

export type SessionState = { initialized: boolean; authenticated: boolean }

/** Read on the server during SSR so protected routes never flash unauthenticated content. */
export const getSessionState = createServerFn({ method: 'GET' }).handler(async (): Promise<SessionState> => {
  const token = readSessionCookie(getRequest())
  const [initialized, authenticated] = await Promise.all([isInitialized(), sessionIsValid(token)])
  return { initialized, authenticated }
})
