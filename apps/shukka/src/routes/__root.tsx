import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext, useRouteContext } from '@tanstack/react-router'
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router'
import type { ReactNode } from 'react'
import { getLocalePreference, localeTags, type Locale } from '~/lib/i18n/index.ts'
import { I18nProvider } from '~/lib/i18n/provider.tsx'
import { ViewRoleProvider } from '~/lib/role-provider.tsx'
import { THEME_INLINE_SCRIPT, type Theme } from '~/lib/theme.ts'
import { getRolePreference } from '~/server/role-fn.ts'
import { getThemePreference } from '~/server/theme-fn.ts'
import { Toaster } from '~/components/ui/sonner.tsx'
import appCss from '~/styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Locale, theme and view role are per-browser cookies; once read during SSR
  // they are owned by client-side state, so the loader never needs to re-run.
  staleTime: Infinity,
  loader: async () => ({
    locale: await getLocalePreference(),
    theme: await getThemePreference(),
    role: await getRolePreference(),
  }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Shukka' },
      { name: 'description', content: 'Self-hosted release manager for Electron and Tauri apps that update through S3' },
      { property: 'og:title', content: 'Shukka' },
      { property: 'og:description', content: 'Self-hosted updates for Electron and Tauri' },
      { property: 'og:image', content: '/og.png' },
      { property: 'og:image:width', content: '2560' },
      { property: 'og:image:height', content: '1280' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:image', content: '/og.png' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg' },
    ],
    scripts: [
      // Cookie-aware pre-paint theme resolver from ~/lib/theme.ts: a pinned
      // cookie wins; without one the OS preference is followed live.
      { children: THEME_INLINE_SCRIPT },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  const { queryClient } = useRouteContext({ from: Route.id })
  const { locale, theme, role } = Route.useLoaderData()
  return (
    <RootDocument locale={locale} theme={theme}>
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLocale={locale}>
          <ViewRoleProvider initialRole={role}>
            <NuqsAdapter>
              <Outlet />
            </NuqsAdapter>
          </ViewRoleProvider>
        </I18nProvider>
      </QueryClientProvider>
    </RootDocument>
  )
}

function RootDocument({
  locale,
  theme,
  children,
}: Readonly<{ locale: Locale; theme: Theme | null; children: ReactNode }>) {
  // A pinned theme renders its class/color-scheme in the first HTML; without
  // one (follow the system) the inline script resolves theme before paint.
  return (
    <html
      lang={localeTags[locale]}
      className={theme === 'dark' ? 'dark' : undefined}
      style={{ colorScheme: theme ?? undefined }}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
