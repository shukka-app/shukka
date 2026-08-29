import { useMutation } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { Check, ChevronsUpDown, LogOut, Settings, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { LanguageSwitcher } from '~/components/language-switcher.tsx'
import { ThemeSwitcher } from '~/components/theme-switcher.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { SidebarMenuButton } from '~/components/ui/sidebar'
import { logoutMutationOptions } from '~/features/auth/requests/session.ts'
import { translateError, useT } from '~/lib/i18n/index.ts'
import { useSetViewRole, useViewRole } from '~/lib/role-context.ts'
import type { ViewRole } from '~/lib/role.ts'

const ROLE_ORDER = ['admin', 'developer', 'content'] as const

/**
 * Single sidebar-footer entry: current role on the button, opening upward into
 * role switch, language, appearance, settings (admin only) and sign out. The
 * role is a pure presentation filter — see docs/adr/panel-view-roles.md.
 */
export function RoleMenu() {
  const router = useRouter()
  const t = useT()
  const role = useViewRole()
  const setRole = useSetViewRole()
  const logout = useMutation(logoutMutationOptions())

  const roleLabels: Record<ViewRole, string> = {
    admin: t.roles.admin,
    developer: t.roles.developer,
    content: t.roles.contentEditor,
  }

  async function signOut() {
    try {
      await logout.mutateAsync()
      await router.navigate({ to: '/login' })
    } catch (cause) {
      toast.error(translateError(t, cause, t.common.requestFailed))
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton tooltip={roleLabels[role]}>
          <UserRound />
          <span className="truncate">{roleLabels[role]}</span>
          <ChevronsUpDown className="ml-auto group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="min-w-56">
        <DropdownMenuLabel>{t.roles.menuLabel}</DropdownMenuLabel>
        {ROLE_ORDER.map((value) => (
          <DropdownMenuItem
            key={value}
            role="menuitemradio"
            aria-checked={value === role}
            className="pl-8"
            onSelect={() => setRole(value)}
          >
            <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
              {value === role ? <Check className="size-4" /> : null}
            </span>
            {roleLabels[value]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {/* Plain rows, not menu items: clicking a switcher must not close the menu. */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm text-muted-foreground">{t.common.language}</span>
          <LanguageSwitcher />
        </div>
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm text-muted-foreground">{t.roles.appearance}</span>
          <ThemeSwitcher />
        </div>
        <DropdownMenuSeparator />
        {role === 'admin' ? (
          <DropdownMenuItem asChild>
            <Link to="/settings">
              <Settings />
              {t.nav.settings}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={signOut}>
          <LogOut />
          {t.nav.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
