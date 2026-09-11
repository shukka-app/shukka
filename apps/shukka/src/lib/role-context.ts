import { createContext, useContext } from 'react'
import type { ViewRole } from './role.ts'

export type ViewRoleContextValue = {
  role: ViewRole
  setRole: (role: ViewRole) => void
}

export const ViewRoleContext = createContext<ViewRoleContextValue | null>(null)

function useViewRoleContext(): ViewRoleContextValue {
  const context = useContext(ViewRoleContext)
  if (!context) throw new Error('role hooks must be used within ViewRoleProvider')
  return context
}

export function useViewRole(): ViewRole {
  return useViewRoleContext().role
}

export function useSetViewRole(): (role: ViewRole) => void {
  return useViewRoleContext().setRole
}
