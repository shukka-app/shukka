import { useQuery } from '@tanstack/react-query'
import { parseAsInteger, useQueryState } from 'nuqs'
import { TrendChart } from '~/components/trend-chart.tsx'
import { hitTrendSeries } from '~/components/trend-series.ts'
import { Skeleton } from '~/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { useFormatters, useT } from '~/lib/i18n/index.ts'
import { DEFAULT_TREND_RANGE, TREND_RANGES, isTrendRange, type TrendRange } from '~/lib/trends.ts'
import { channelTrendQueryOptions } from './requests/trends.ts'

const RANGE_LABEL_KEYS = { 7: 'range7', 30: 'range30', 90: 'range90' } as const

/** Channel traffic over 7/30/90 days; the range lives in the `?range=` URL param. */
export function ChannelTrend({ slug, channel }: { slug: string; channel: string }) {
  const t = useT()
  const format = useFormatters()
  const [rawRange, setRange] = useQueryState('range', parseAsInteger.withDefault(DEFAULT_TREND_RANGE))
  // A hand-edited URL can carry any integer; the server rejects it loudly, so fall back here.
  const range: TrendRange = isTrendRange(rawRange) ? rawRange : DEFAULT_TREND_RANGE
  const { data, isError } = useQuery(channelTrendQueryOptions({ slug, channel, range }))

  const formatTick =
    data?.granularity === 'hour'
      ? (unixSeconds: number) => (unixSeconds % 86400 === 0 ? format.chartDay(unixSeconds) : format.chartHour(unixSeconds))
      : format.chartDay

  return (
    <div className="mt-6 rounded-2xl bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm text-muted-foreground">{t.trends.title}</h3>
        <Tabs value={String(range)} onValueChange={(value) => void setRange(Number(value))}>
          <TabsList aria-label={t.trends.title}>
            {TREND_RANGES.map((value) => (
              <TabsTrigger key={value} value={String(value)}>
                {t.trends[RANGE_LABEL_KEYS[value]]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {data ? (
        <div className="mt-3">
          <TrendChart
            points={data.points}
            series={hitTrendSeries({ downloads: t.channels.downloads, updateChecks: t.channels.updateChecks })}
            formatTick={formatTick}
            formatValue={format.number}
            ariaLabel={t.trends.ariaChannel}
            emptyHint={t.trends.empty}
            height={160}
          />
        </div>
      ) : isError ? (
        <p className="mt-3 text-xs text-muted-foreground">{t.trends.error}</p>
      ) : (
        <Skeleton className="mt-3 h-40 w-full rounded-xl" />
      )}
    </div>
  )
}
