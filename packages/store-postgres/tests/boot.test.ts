import { afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { isUniqueConstraint } from '../src/conflict.ts'
import { postgresAdapter } from '../src/index.ts'
import type { Store } from '@shukka/store'

function postgresUrl(): string {
  const url = process.env.SHUKKA_DB_URL
  if (!url || !(url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    throw new Error('store-postgres tests require SHUKKA_DB_URL to be a Postgres URL')
  }
  return url
}

const appInput = {
  name: 'Acme',
  slug: 'acme-pg',
  s3Endpoint: null,
  s3Region: 'us-east-1',
  s3Bucket: 'releases',
  s3Prefix: '',
  s3AccessKeyId: 'key',
  s3SecretEncrypted: 'cipher',
  s3ForcePathStyle: false,
  updaterKind: 'electron' as const,
}

async function reset(store: Store): Promise<void> {
  for (const app of await store.listApps('createdAt')) {
    await store.deleteApp(app.id)
  }
  await store.deleteAdmin()
  await store.deleteSessions()
}

describe('isUniqueConstraint', () => {
  it('maps Postgres unique_violation 23505, including wrapped causes', () => {
    expect(isUniqueConstraint({ code: '23505' })).toBe(true)
    expect(isUniqueConstraint({ cause: { code: '23505' } })).toBe(true)
    expect(isUniqueConstraint({ code: '23503' })).toBe(false)
    expect(isUniqueConstraint(new Error('nope'))).toBe(false)
  })
})

describe('postgresAdapter.boot', () => {
  const previousUrl = process.env.SHUKKA_DB_URL
  const previousDriver = process.env.SHUKKA_DB_DRIVER
  let store: Store | undefined

  afterEach(async () => {
    if (store) await reset(store)
    store = undefined
    if (previousUrl === undefined) delete process.env.SHUKKA_DB_URL
    else process.env.SHUKKA_DB_URL = previousUrl
    if (previousDriver === undefined) delete process.env.SHUKKA_DB_DRIVER
    else process.env.SHUKKA_DB_DRIVER = previousDriver
  })

  it('connects, migrates, and serves the store port', async () => {
    process.env.SHUKKA_DB_URL = postgresUrl()
    process.env.SHUKKA_DB_DRIVER = 'postgres'

    store = await postgresAdapter.boot()
    await store.ping()

    const created = await store.createApp(appInput)
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect((await store.listChannels(created.value.id)).map((channel) => channel.name)).toEqual(['stable'])

    const clash = await store.createApp(appInput)
    expect(clash).toEqual({ ok: false, error: 'conflict' })

    const channel = (await store.listChannels(created.value.id))[0]!
    const pending = await store.insertPending({
      id: 'upload-1',
      appId: created.value.id,
      channelId: channel.id,
      version: '1.0.0',
      files: [{ filename: 'latest.yml', s3Key: 'acme/stable/1.0.0/latest.yml', size: 1 }],
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    })
    expect(pending.ok).toBe(true)

    const finalized = await store.finalize({
      uploadId: 'upload-1',
      appId: created.value.id,
      channelId: channel.id,
      version: '1.0.0',
      metadata: { channel: 'stable' },
      artifacts: [
        {
          filename: 'latest.yml',
          s3Key: 'acme/stable/1.0.0/latest.yml',
          size: 1,
          kind: 'metadata',
        },
      ],
      release: true,
      now: Math.floor(Date.now() / 1000),
    })
    expect(finalized.ok).toBe(true)
    if (!finalized.ok) return
    expect(finalized.value.metadata).toEqual({ channel: 'stable' })

    await store.recordHit(finalized.value.id, 'metadata', Math.floor(Date.now() / 1000))
    const version = await store.getVersionById(finalized.value.id)
    expect(version?.metadataHits).toBe(1)
    expect(await store.listHitBuckets(finalized.value.id)).toHaveLength(1)
  })

  it('serializes overlapping boots so __drizzle_migrations is not corrupted', async () => {
    process.env.SHUKKA_DB_URL = postgresUrl()
    process.env.SHUKKA_DB_DRIVER = 'postgres'

    store = await postgresAdapter.boot()
    const sql = postgres(postgresUrl(), { max: 1, onnotice: () => undefined })
    try {
      const before = await sql<{ n: string }[]>`select count(*)::text as n from drizzle.__drizzle_migrations`
      const [a, b] = await Promise.all([postgresAdapter.boot(), postgresAdapter.boot()])
      await a.ping()
      await b.ping()
      const after = await sql<{ n: string }[]>`select count(*)::text as n from drizzle.__drizzle_migrations`
      expect(Number(after[0]?.n)).toBe(Number(before[0]?.n))
      expect(Number(after[0]?.n)).toBeGreaterThan(0)
    } finally {
      await sql.end({ timeout: 5 })
    }
  })
})
