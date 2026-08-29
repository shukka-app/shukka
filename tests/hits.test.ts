import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** In-memory stand-in for S3, same harness as release-flow.test.ts. */
const objects = new Map<string, string>()

vi.mock('~/lib/storage.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/storage.ts')>()
  return {
    ...actual,
    verifyWritable: vi.fn(async () => undefined),
    presignPut: vi.fn(async (_s3: unknown, key: string) => `https://storage.test/${key}?put`),
    presignGet: vi.fn(async (_s3: unknown, key: string) => `https://storage.test/${key}?get`),
    headObject: vi.fn(async (_s3: unknown, key: string) =>
      objects.has(key) ? { size: Buffer.byteLength(objects.get(key)!) } : null,
    ),
    getObjectText: vi.fn(async (_s3: unknown, key: string) => objects.get(key) ?? ''),
    deleteObjects: vi.fn(async (_s3: unknown, keys: string[]) => {
      for (const key of keys) objects.delete(key)
    }),
  }
})

const { and, eq, sql } = await import('drizzle-orm')
const { db } = await import('~/db/index.ts')
const { apps, hitBuckets, versions } = await import('~/db/schema.ts')
const { getObjectText } = await import('~/lib/storage.ts')
const { clearObjectCache } = await import('~/lib/object-cache.ts')
const { createApp } = await import('~/server/apps.ts')
const { createChannel, deleteChannel, getChannel } = await import('~/server/channels.ts')
const { deleteVersion, finalizeUpload, initUpload } = await import('~/server/releases.ts')
const { resolveFeedRequest } = await import('~/server/feed.ts')
const { channelTrend, parseTrendRange, recordHit, versionTrend } = await import('~/server/hits.ts')

const ORIGIN = 'https://updates.test'
const { ShukkaError } = await import('~/lib/errors.ts')

const HOUR = 3600
const DAY = 86400
/** Aligned to the current hour so bucket arithmetic lands on whole buckets. */
const NOW = Math.floor(Date.now() / 1000 / HOUR) * HOUR

const appInput = {
  name: 'Acme',
  slug: 'acme',
  s3Endpoint: null,
  s3Region: 'us-east-1',
  s3Bucket: 'releases',
  s3Prefix: 'acme',
  s3AccessKeyId: 'key',
  s3SecretAccessKey: 'secret',
  s3ForcePathStyle: false,
}

function metadataFor(version: string, installer: string) {
  return `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: aaa==\n    size: 10\npath: ${installer}\n`
}

/** Runs a full init → upload → finalize cycle. */
async function publish(app: Awaited<ReturnType<typeof createApp>>, channel: string, version: string) {
  const installer = `Acme-Setup-${version}.exe`
  const init = await initUpload(app, {
    channel,
    version,
    files: [{ filename: 'latest.yml' }, { filename: installer }],
  })
  for (const file of init.files) {
    objects.set(file.key, file.filename === 'latest.yml' ? metadataFor(version, installer) : 'binary')
  }
  return { init, result: await finalizeUpload(app, init.uploadId, { release: true }), installer }
}

async function bucketSum(versionId: number, kind: 'metadata' | 'artifact') {
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${hitBuckets.count}), 0)` })
    .from(hitBuckets)
    .where(and(eq(hitBuckets.versionId, versionId), eq(hitBuckets.kind, kind)))
    .get()
  return row?.total ?? 0
}

beforeEach(async () => {
  clearObjectCache()
})

describe('hit buckets', () => {
  beforeEach(async () => {
    await db.delete(apps).run()
    objects.clear()
  })

  it('accumulates repeated hits in the same hour into one bucket row', async () => {
    const app = await createApp(appInput)
    const { result } = await publish(app, 'stable', '1.0.0')

    await recordHit(result.versionId, 'metadata', NOW)
    await recordHit(result.versionId, 'metadata', NOW)

    const rows = await db.select().from(hitBuckets).where(eq(hitBuckets.versionId, result.versionId)).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'metadata', hourStart: NOW, count: 2 })
  })

  it('splits hits across the hour boundary into two rows', async () => {
    const app = await createApp(appInput)
    const { result } = await publish(app, 'stable', '1.0.0')

    await recordHit(result.versionId, 'artifact', NOW - 1)
    await recordHit(result.versionId, 'artifact', NOW)

    const rows = await db.select().from(hitBuckets).where(eq(hitBuckets.versionId, result.versionId)).all()
    expect(rows.map((row) => row.hourStart).sort((a, b) => a - b)).toEqual([NOW - HOUR, NOW])
  })

  it('reads latest.yml from S3 once across two feed checks and still records both hits', async () => {
    const app = await createApp(appInput)
    const { result } = await publish(app, 'stable', '1.0.0')
    vi.mocked(getObjectText).mockClear()

    await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)

    expect(getObjectText).toHaveBeenCalledTimes(1)
    const row = await db.select().from(versions).where(eq(versions.id, result.versionId)).get()
    expect(row?.metadataHits).toBe(2)
    expect(row?.metadataHits).toBe(await bucketSum(result.versionId, 'metadata'))
  })

  it('keeps version counters equal to the sum of their buckets through the feed path', async () => {
    const app = await createApp(appInput)
    const { installer, result } = await publish(app, 'stable', '1.0.0')

    await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    await resolveFeedRequest('acme', 'stable', installer, ORIGIN)

    const row = await db.select().from(versions).where(eq(versions.id, result.versionId)).get()
    expect(row?.metadataHits).toBe(2)
    expect(row?.artifactHits).toBe(1)
    expect(row?.metadataHits).toBe(await bucketSum(result.versionId, 'metadata'))
    expect(row?.artifactHits).toBe(await bucketSum(result.versionId, 'artifact'))
  })

  it('cascades buckets when a version or channel is deleted', async () => {
    const app = await createApp(appInput)
    const first = await publish(app, 'stable', '1.0.0')
    await createChannel(app.id, 'beta')
    const second = await publish(app, 'beta', '2.0.0')
    await recordHit(first.result.versionId, 'metadata', NOW)
    await recordHit(second.result.versionId, 'metadata', NOW)

    await deleteVersion(app, first.result.versionId)
    expect(await db.select().from(hitBuckets).where(eq(hitBuckets.versionId, first.result.versionId)).all()).toHaveLength(0)
    expect(await db.select().from(hitBuckets).where(eq(hitBuckets.versionId, second.result.versionId)).all()).toHaveLength(1)

    await deleteChannel(app, (await getChannel(app.id, 'beta')).id)
    expect(await db.select().from(hitBuckets).all()).toHaveLength(0)
  })
})

describe('channelTrend', () => {
  beforeEach(async () => {
    await db.delete(apps).run()
    objects.clear()
  })

  it('aggregates, zero-fills and scopes to the range, excluding other channels', async () => {
    const app = await createApp(appInput)
    const { result } = await publish(app, 'stable', '1.0.0')
    await createChannel(app.id, 'beta')
    const other = await publish(app, 'beta', '1.0.0')
    const channelId = (await getChannel(app.id, 'stable')).id

    await recordHit(result.versionId, 'metadata', NOW - HOUR)
    await recordHit(result.versionId, 'metadata', NOW - HOUR)
    await recordHit(result.versionId, 'artifact', NOW - 2 * HOUR)
    await recordHit(result.versionId, 'metadata', NOW - 40 * DAY) // outside 7d/30d, inside 90d
    await recordHit(other.result.versionId, 'metadata', NOW - HOUR) // another channel — never counted

    const hourly = await channelTrend(app.id, channelId, 7, NOW)
    expect(hourly.granularity).toBe('hour')
    expect(hourly.points).toHaveLength(168)
    expect(hourly.points.at(-1)).toEqual({ t: NOW, metadata: 0, artifact: 0 })
    expect(hourly.points.find((point) => point.t === NOW - HOUR)).toEqual({ t: NOW - HOUR, metadata: 2, artifact: 0 })
    expect(hourly.points.find((point) => point.t === NOW - 2 * HOUR)?.artifact).toBe(1)
    expect(hourly.points.reduce((sum, point) => sum + point.metadata + point.artifact, 0)).toBe(3)

    const daily = await channelTrend(app.id, channelId, 30, NOW)
    expect(daily.granularity).toBe('day')
    expect(daily.points).toHaveLength(30)
    expect(daily.points.at(-1)?.t).toBe(Math.floor(NOW / DAY) * DAY)
    expect(daily.points.reduce((sum, point) => sum + point.metadata, 0)).toBe(2)
    expect(daily.points.reduce((sum, point) => sum + point.artifact, 0)).toBe(1)

    const ninety = await channelTrend(app.id, channelId, 90, NOW)
    expect(ninety.points).toHaveLength(90)
    expect(ninety.points.reduce((sum, point) => sum + point.metadata, 0)).toBe(3)
  })

  it('rejects cross-app access as not_found', async () => {
    const appA = await createApp(appInput)
    const appB = await createApp({ ...appInput, name: 'Other', slug: 'other' })

    await expect(channelTrend(appB.id, (await getChannel(appA.id, 'stable')).id, 30, NOW)).rejects.toThrow(ShukkaError)
    await expect(channelTrend(appB.id, (await getChannel(appA.id, 'stable')).id, 30, NOW)).rejects.toThrow(/not found/i)
  })
})

describe('versionTrend', () => {
  beforeEach(async () => {
    await db.delete(apps).run()
    objects.clear()
  })

  it('windows to the 14 UTC days after release and omits future days', async () => {
    const app = await createApp(appInput)
    const { result } = await publish(app, 'stable', '1.0.0')
    const version = (await db.select().from(versions).where(eq(versions.id, result.versionId)).get())!
    expect(version.releasedAt).toEqual(expect.any(Number))
    const releasedAt = version.releasedAt as number
    const releaseDay = Math.floor(releasedAt / DAY) * DAY

    await recordHit(result.versionId, 'artifact', releasedAt)
    await recordHit(result.versionId, 'artifact', releasedAt + DAY)

    const trend = await versionTrend(app.id, result.versionId, releasedAt + 3 * DAY)
    expect(trend.points.at(0)?.t).toBe(releaseDay)
    expect(trend.points).toHaveLength(4)
    expect(trend.points.at(-1)?.t).toBe(releaseDay + 3 * DAY)
    expect(trend.points[0]?.artifact).toBe(1)
    expect(trend.points[1]?.artifact).toBe(1)

    const full = await versionTrend(app.id, result.versionId, releasedAt + 30 * DAY)
    expect(full.points).toHaveLength(14)
    expect(full.points.at(-1)?.t).toBe(releaseDay + 13 * DAY)
  })

  it('rejects cross-app access as not_found', async () => {
    const appA = await createApp(appInput)
    const appB = await createApp({ ...appInput, name: 'Other', slug: 'other' })
    const { result } = await publish(appA, 'stable', '1.0.0')

    await expect(versionTrend(appB.id, result.versionId, NOW)).rejects.toThrow(ShukkaError)
    await expect(versionTrend(appB.id, result.versionId, NOW)).rejects.toThrow(/not found/i)
  })
})

describe('parseTrendRange', () => {
  it('defaults when missing and is loud when invalid', () => {
    expect(parseTrendRange(null)).toBe(30)
    expect(parseTrendRange('7')).toBe(7)
    expect(parseTrendRange('30')).toBe(30)
    expect(parseTrendRange('90')).toBe(90)
    expect(() => parseTrendRange('14')).toThrow(ShukkaError)
    expect(() => parseTrendRange('abc')).toThrow(ShukkaError)
    expect(() => parseTrendRange('')).toThrow(ShukkaError)
  })
})
