import '@tanstack/react-start/client-only'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TrendPoint } from '~/lib/trends.ts'
import type { TrendSeries } from './trend-series.ts'

/**
 * The only recharts importer. Marked client-only so the Worker SSR graph
 * emits a stub (or nothing); the real chart lands on dist/client.
 * All colors are CSS variables, so theme switching needs no JS
 * (ADR: hit-trends). The two series are overlaid areas, not stacked:
 * checks and downloads are independent measures and their sum is meaningless.
 */
const STROKE_BY_TONE = {
  flare: 'var(--flare)',
  ink: 'color-mix(in oklab, var(--ink) 45%, transparent)',
} as const

const FILL_BY_TONE = {
  flare: 'color-mix(in oklab, var(--flare) 10%, transparent)',
  ink: 'transparent',
} as const

const TICK_STYLE = { fill: 'color-mix(in oklab, var(--ink) 40%, transparent)', fontSize: 11 }

type InnerProps = {
  points: TrendPoint[]
  series: TrendSeries[]
  formatTick: (unixSeconds: number) => string
  formatValue: (value: number) => string
}

export function TrendChartInner({ points, series, formatTick, formatValue }: InnerProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={formatTick}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          allowDecimals={false}
          tickFormatter={formatValue}
          tick={TICK_STYLE}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip content={<ChartTooltip series={series} formatTick={formatTick} formatValue={formatValue} />} />
        {series.map((entry) => (
          <Area
            key={entry.key}
            dataKey={entry.key}
            name={entry.label}
            type="monotone"
            stroke={STROKE_BY_TONE[entry.tone]}
            fill={FILL_BY_TONE[entry.tone]}
            strokeWidth={1.5}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** recharts' default tooltip ships its own colors, which breaks theming. */
function ChartTooltip({
  active,
  label,
  payload,
  series,
  formatTick,
  formatValue,
}: {
  active?: boolean
  label?: number
  payload?: readonly { dataKey?: string | number; value?: number | string }[]
  series: TrendSeries[]
  formatTick: (unixSeconds: number) => string
  formatValue: (value: number) => string
}) {
  if (!active || !payload || label === undefined) return null
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 text-xs">
      <p className="text-muted-foreground">{formatTick(label)}</p>
      {series.map((entry) => {
        const item = payload.find((candidate) => candidate.dataKey === entry.key)
        return (
          <p key={entry.key} className="mt-1 flex items-baseline justify-between gap-6">
            <span className="text-foreground/60">{entry.label}</span>
            <span className="font-mono tabular-nums">{formatValue(Number(item?.value ?? 0))}</span>
          </p>
        )
      })}
    </div>
  )
}
