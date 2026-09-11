import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getRoleCookie, resolveRole, type ViewRole } from '~/lib/role.ts'

/** Read during SSR so the first paint already renders the stored view role. */
export const getRolePreference = createServerFn({ method: 'GET' }).handler(async (): Promise<ViewRole> => {
  return resolveRole(getRoleCookie(getRequest()))
})
