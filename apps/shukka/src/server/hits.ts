import { ShukkaError } from '~/lib/errors.ts'
import { isCloudFunction } from '~/lib/runtime.ts'
import { store } from '~/lib/store.ts'
import {
  DEFAULT_TREND_RANGE,
  TREND_RANGES,
  VERSION_TREND_DAYS,
  isTrendRange,
  type ChannelTrend,
  type TrendPoint,
  type TrendRange,
  type VersionTrend,
} from '~/lib/trends.ts'

const HOUR = 3600
const DAY = 86400

const nowSeconds = () => Math.floor(Date.now() / 1000)

export type HitKind = 'metadata' | 'artifact'

/**
 * One feed hit: the lifetime counter stays authoritative and the hourly bucket
 * feeds trend charts. Both writes land in one store method so the invariant
 * counter ≡ SUM(buckets) has no window (ADR: hit-trends). `now` is injectable
 * as a test seam.
 */
export async function recordHit(versionId: number, kind: HitKind, now: number = nowSeconds()): Promise<void> {
  if (isCloudFunction()) return
  await store.recordHit(versionId, kind, now)
}

/** `?range=` is loud when present but invalid, and defaults when missing. */
export function parseTrendRange(raw: string | null): TrendRange {
  if (raw === null) return DEFAULT_TREND_RANGE
  const value = Number(raw)
  if (!Number.isInteger(value) || !isTrendRange(value)) {
    throw new ShukkaError('invalid_request', `Invalid trend range "${raw}"; expected one of ${TREND_RANGES.join(', ')}`)
  }
  return value
}

function fillPoints(rows: { bucket: number; kind: HitKind; count: number }[], start: number, end: number, step: number) {
  const points: TrendPoint[] = []
  for (let t = start; t <= end; t += step) points.push({ t, metadata: 0, artifact: 0 })
  const indexByT = new Map(points.map((point, index) => [point.t, index]))
  for (const row of rows) {
    const point = points[indexByT.get(row.bucket) ?? -1]
    if (point) point[row.kind] = row.count
  }
  return points
}

/**
 * Fixed-length series for a channel, aligned to the current hour (7d) or UTC
 * day (30/90d), zero-filled where no hits landed. Day boundaries are integer
 * math on unix seconds, i.e. UTC (ADR: hit-trends).
 */
export async function channelTrend(
  appId: number,
  channelId: number,
  range: TrendRange,
  now: number = nowSeconds(),
): Promise<ChannelTrend> {
  const channel = await store.getChannelById(channelId)
  if (!channel || channel.appId !== appId) throw new ShukkaError('not_found', 'Channel not found')

  const granularity = range === 7 ? ('hour' as const) : ('day' as const)
  const step = granularity === 'hour' ? HOUR : DAY
  const end = Math.floor(now / step) * step
  // Inclusive fixed-length window: `range` days' worth of buckets ending now.
  const start = end - range * DAY + step

  const rows = await store.sumHitBucketsForChannel(channelId, start, step)
  return { granularity, points: fillPoints(rows, start, end, step) }
}

/** The 14 UTC days after release; days after `now` are omitted, not zero-filled. */
export async function versionTrend(appId: number, versionId: number, now: number = nowSeconds()): Promise<VersionTrend> {
  const version = await store.getVersionForApp(appId, versionId)
  if (!version) throw new ShukkaError('not_found', 'Version not found')
  if (version.releasedAt == null) return { points: [] }

  const releaseDay = Math.floor(version.releasedAt / DAY) * DAY
  const windowEnd = releaseDay + VERSION_TREND_DAYS * DAY
  const end = Math.min(Math.floor(now / DAY) * DAY, windowEnd - DAY)

  const rows = await store.sumHitBucketsForVersion(versionId, releaseDay, windowEnd)
  return { points: end < releaseDay ? [] : fillPoints(rows, releaseDay, end, DAY) }
}
