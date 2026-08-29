import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { PackageIcon } from '~/components/brand.tsx'
import { PageHeader } from '~/components/page-header.tsx'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { appsQueryOptions, primeAppsQuery } from '~/features/apps/requests/apps.ts'
import { useFormatters, useT } from '~/lib/i18n/index.ts'
import { updaterKindLabelKey } from '~/lib/updater-kind.ts'
import { useViewRole } from '~/lib/role-context.ts'
import { canCreateApp } from '~/lib/role.ts'

export const Route = createFileRoute('/_panel/apps/')({
  loader: ({ context }) => primeAppsQuery(context.queryClient),
  component: AppsPage,
})

function AppsPage() {
  const initialData = Route.useLoaderData()
  const { data: apps, isPending } = useQuery({ ...appsQueryOptions(), initialData })
  const t = useT()
  const format = useFormatters()
  const role = useViewRole()

  return (
    <>
      <PageHeader title={t.apps.title}>
        {canCreateApp(role) ? (
          <Button asChild>
            <Link to="/apps/new">
              <Plus /> {t.apps.newApp}
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      {isPending ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index}>
              <Skeleton className="h-28 rounded-2xl" />
            </li>
          ))}
        </ul>
      ) : apps?.length ? (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => (
            <li key={app.id}>
              <Link
                to="/apps/$appSlug"
                params={{ appSlug: app.slug }}
                className="flex h-full flex-col rounded-2xl bg-card px-5 py-5 transition-colors hover:bg-accent/60"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate">{app.name}</p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {t.apps[updaterKindLabelKey(app.updaterKind)]}
                  </p>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {app.lastReleasedAt
                    ? `${t.apps.lastRelease} ${format.when(app.lastReleasedAt)}`
                    : t.apps.noReleases}
                </p>
                <div className="mt-5">
                  <p className="text-sm tabular-nums">{app.totalDownloads}</p>
                  <p className="text-xs text-muted-foreground">{t.apps.downloads}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <FirstRun />
      )}
    </>
  )
}

function FirstRun() {
  const t = useT()
  const role = useViewRole()
  const steps = [
    [t.apps.firstRun.step1Title, t.apps.firstRun.step1Detail],
    [t.apps.firstRun.step2Title, t.apps.firstRun.step2Detail],
    [t.apps.firstRun.step3Title, t.apps.firstRun.step3Detail],
  ] as const

  return (
    <div className="rounded-2xl bg-card px-8 py-12">
      <PackageIcon className="size-8 text-muted-foreground" />
      <h2 className="mt-5 text-lg">{t.apps.firstRun.title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{t.apps.firstRun.description}</p>
      <ol className="mt-8 max-w-lg space-y-5">
        {steps.map(([title, detail], index) => (
          <li key={title} className="flex gap-4">
            <span className="font-mono text-sm text-muted-foreground">0{index + 1}</span>
            <div>
              <p className="text-sm">{title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
            </div>
          </li>
        ))}
      </ol>
      {canCreateApp(role) ? (
        <Button asChild className="mt-8">
          <Link to="/apps/new">
            <Plus /> {t.apps.firstRun.cta}
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
