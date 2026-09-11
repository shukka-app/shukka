import { useQuery } from '@tanstack/react-query'
import { TrendChart } from '~/components/trend-chart.tsx'
import { hitTrendSeries } from '~/components/trend-series.ts'
import { Skeleton } from '~/components/ui/skeleton'
import { useFormatters, useT } from '~/lib/i18n/index.ts'
import { versionTrendQueryOptions } from './requests/trends.ts'
import type { VersionDetail } from '~/server/dashboard.ts'

/**
 * First-14-days trend inside the version stats dialog. Radix mounts dialog
 * content on open, so mounting this component is what triggers the fetch.
 */
export function VersionTrend({
  slug,
  channel,
  version,
}: {
  slug: string
  channel: string
  version: VersionDetail
}) {
  const t = useT()
  const format = useFormatters()
  const { data, isError } = useQuery(versionTrendQueryOptions({ slug, channel, version: version.version }))

  return (
    <div className="mt-5">
      <p className="text-xs text-foreground/40">{t.trends.first14Days}</p>
      {data ? (
        <div className="mt-2">
          <TrendChart
            points={data.points}
            series={hitTrendSeries({ downloads: t.channels.downloads, updateChecks: t.channels.updateChecks })}
            formatTick={format.chartDay}
            formatValue={format.number}
            ariaLabel={t.trends.ariaVersion(version.version)}
            emptyHint={t.trends.empty}
            height={120}
          />
        </div>
      ) : isError ? (
        <p className="mt-2 text-xs text-muted-foreground">{t.trends.error}</p>
      ) : (
        <Skeleton className="mt-2 h-[120px] w-full rounded-xl" />
      )}
    </div>
  )
}
