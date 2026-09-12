/**
 * Shared contract for hit-trend series (ADR: hit-trends). No db/react imports:
 * the client value-imports from here, so this module must stay free of
 * server-only dependencies.
 */
export const TREND_RANGES = [7, 30, 90] as const
export type TrendRange = (typeof TREND_RANGES)[number]
export const DEFAULT_TREND_RANGE: TrendRange = 30

/** Fixed window of the per-version trend: the 14 UTC days after release. */
export const VERSION_TREND_DAYS = 14

export function isTrendRange(value: number): value is TrendRange {
  return (TREND_RANGES as readonly number[]).includes(value)
}

/** One series point: bucket start (unix seconds) and per-kind counts. */
export type TrendPoint = { t: number; metadata: number; artifact: number }

export type ChannelTrend = {
  granularity: 'hour' | 'day'
  points: TrendPoint[]
}

export type VersionTrend = {
  points: TrendPoint[]
}
