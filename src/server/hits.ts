import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '~/db/index.ts'
import { channels, hitBuckets, versions } from '~/db/schema.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { isCloudFunction } from '~/lib/runtime.ts'
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
 * feeds trend charts. Both writes land in one transaction so the invariant
 * counter ≡ SUM(buckets) has no window (ADR: hit-trends). `now` is injectable
 * as a test seam.
 */
export function recordHit(versionId: number, kind: HitKind, now: number = nowSeconds()): void {
  if (isCloudFunction()) return
  const hourStart = Math.floor(now / HOUR) * HOUR
  db.transaction((tx) => {
    const column = kind === 'metadata' ? versions.metadataHits : versions.artifactHits
    tx.update(versions)
      .set({ [kind === 'metadata' ? 'metadataHits' : 'artifactHits']: sql`${column} + 1` })
      .where(eq(versions.id, versionId))
      .run()
    tx.insert(hitBuckets)
      .values({ versionId, kind, hourStart, count: 1 })
      .onConflictDoUpdate({
        target: [hitBuckets.versionId, hitBuckets.kind, hitBuckets.hourStart],
        set: { count: sql`${hitBuckets.count} + 1` },
      })
      .run()
  })
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
export function channelTrend(
  appId: number,
  channelId: number,
  range: TrendRange,
  now: number = nowSeconds(),
): ChannelTrend {
  const channel = db
    .select()
    .from(channels)
    .where(and(eq(channels.id, channelId), eq(channels.appId, appId)))
    .get()
  if (!channel) throw new ShukkaError('not_found', 'Channel not found')

  const granularity = range === 7 ? ('hour' as const) : ('day' as const)
  const step = granularity === 'hour' ? HOUR : DAY
  const end = Math.floor(now / step) * step
  // Inclusive fixed-length window: `range` days' worth of buckets ending now.
  const start = end - range * DAY + step

  // better-sqlite3 binds numbers as REAL, so `/` would be float division;
  // the CAST forces integer truncation back to the UTC day/hour boundary.
  const bucket = sql<number>`cast(${hitBuckets.hourStart} / ${step} as integer) * ${step}`
  const rows = db
    .select({ bucket, kind: hitBuckets.kind, count: sql<number>`sum(${hitBuckets.count})` })
    .from(hitBuckets)
    .innerJoin(versions, eq(hitBuckets.versionId, versions.id))
    .where(and(eq(versions.channelId, channelId), gte(hitBuckets.hourStart, start)))
    .groupBy(bucket, hitBuckets.kind)
    .all()

  return { granularity, points: fillPoints(rows, start, end, step) }
}

/** The 14 UTC days after release; days after `now` are omitted, not zero-filled. */
export function versionTrend(appId: number, versionId: number, now: number = nowSeconds()): VersionTrend {
  const version = db
    .select()
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.appId, appId)))
    .get()
  if (!version) throw new ShukkaError('not_found', 'Version not found')
  if (version.releasedAt == null) return { points: [] }

  const releaseDay = Math.floor(version.releasedAt / DAY) * DAY
  const windowEnd = releaseDay + VERSION_TREND_DAYS * DAY
  const end = Math.min(Math.floor(now / DAY) * DAY, windowEnd - DAY)

  const bucket = sql<number>`cast(${hitBuckets.hourStart} / ${DAY} as integer) * ${DAY}`
  const rows = db
    .select({ bucket, kind: hitBuckets.kind, count: sql<number>`sum(${hitBuckets.count})` })
    .from(hitBuckets)
    .where(and(eq(hitBuckets.versionId, versionId), gte(hitBuckets.hourStart, releaseDay), lt(hitBuckets.hourStart, windowEnd)))
    .groupBy(bucket, hitBuckets.kind)
    .all()

  return { points: end < releaseDay ? [] : fillPoints(rows, releaseDay, end, DAY) }
}
