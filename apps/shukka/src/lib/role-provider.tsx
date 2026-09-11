import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ViewRoleContext, type ViewRoleContextValue } from './role-context.ts'
import { setRoleCookie, type ViewRole } from './role.ts'

/**
 * Holds the active view role. Switching persists the per-browser cookie so the
 * next SSR pass renders the same role. The role is a pure presentation filter —
 * see docs/adr/panel-view-roles.md.
 */
export function ViewRoleProvider({ initialRole, children }: { initialRole: ViewRole; children: ReactNode }) {
  const [role, setRoleState] = useState(initialRole)
  const setRole = useCallback((next: ViewRole) => {
    setRoleState(next)
    setRoleCookie(next)
  }, [])
  const value = useMemo<ViewRoleContextValue>(() => ({ role, setRole }), [role, setRole])
  return <ViewRoleContext.Provider value={value}>{children}</ViewRoleContext.Provider>
}
