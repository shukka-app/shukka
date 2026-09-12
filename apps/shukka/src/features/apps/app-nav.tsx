import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Boxes } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/components/ui/sidebar'
import { Skeleton } from '~/components/ui/skeleton'
import { useT } from '~/lib/i18n/index.ts'
import { appsQueryOptions } from './requests/apps.ts'

/** Live list of managed apps, so switching between them stays one click away. */
export function AppNav() {
  const { data: apps, isPending } = useQuery(appsQueryOptions())
  const t = useT()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{t.nav.yourApps}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {isPending ? (
            <div className="space-y-2 px-2 py-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
            </div>
          ) : apps?.length ? (
            apps.map((app) => (
              <SidebarMenuItem key={app.id}>
                <SidebarMenuButton asChild>
                  <Link to="/apps/$appSlug" params={{ appSlug: app.slug }} activeProps={{ 'data-active': true }}>
                    <Boxes />
                    <span className="truncate">{app.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))
          ) : (
            <p className="px-2 py-1 text-xs text-muted-foreground">{t.nav.noApps}</p>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
