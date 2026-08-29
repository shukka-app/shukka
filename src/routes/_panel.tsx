import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { Package } from 'lucide-react'
import { useRef } from 'react'
import { AnimatedPackageIcon, type AnimatedPackageIconHandle } from '~/components/brand.tsx'
import { PageHeaderSlot } from '~/components/page-header.tsx'
import { AppNav } from '~/features/apps/app-nav.tsx'
import { RoleMenu } from '~/features/panel/role-menu.tsx'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '~/components/ui/sidebar'
import { Confirm, Prompt } from '~/components/confirm.tsx'
import { useT } from '~/lib/i18n/index.ts'
import { getSessionState } from '~/server/session-fn.ts'
import { getSidebarState } from '~/server/sidebar-fn.ts'

export const Route = createFileRoute('/_panel')({
  beforeLoad: async () => {
    const session = await getSessionState()
    if (!session.initialized) throw redirect({ to: '/setup' })
    if (!session.authenticated) throw redirect({ to: '/login' })
  },
  loader: async () => ({
    sidebarState: await getSidebarState(),
  }),
  component: PanelLayout,
})

function PanelLayout() {
  const { sidebarState } = Route.useLoaderData()
  const t = useT()
  const brandIconRef = useRef<AnimatedPackageIconHandle>(null)

  return (
    <SidebarProvider defaultOpen={sidebarState !== 'false'}>
      <Sidebar collapsible="icon">
        <SidebarHeader className="p-0">
          <Link
            to="/apps"
            aria-label={t.nav.allApps}
            onMouseEnter={() => brandIconRef.current?.play()}
            onMouseLeave={() => brandIconRef.current?.reset()}
            className="flex h-12 w-full items-center gap-2.5 px-4 text-sidebar-foreground outline-hidden transition-colors hover:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <AnimatedPackageIcon ref={brandIconRef} className="size-5" />
            <span className="text-base group-data-[collapsible=icon]:hidden">Shukka</span>
          </Link>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t.nav.apps}>
                    <Link to="/apps" activeOptions={{ exact: true }} activeProps={{ 'data-active': true }}>
                      <Package />
                      <span>{t.nav.apps}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <AppNav />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <RoleMenu />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm">
          <header className="flex h-12 shrink-0 items-center px-3">
            <SidebarTrigger aria-label={t.nav.toggleSidebar} title={t.nav.toggleSidebar} />
          </header>
          <div className="mx-auto w-full max-w-5xl px-5">
            <PageHeaderSlot />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-12">
          <Outlet />
          <Confirm />
          <Prompt />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
