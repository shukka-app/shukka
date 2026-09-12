import { afterEach, describe, expect, it } from 'vitest'
import mysql from 'mysql2/promise'
import { isUniqueConstraint } from '../src/conflict.ts'
import { mysqlAdapter } from '../src/index.ts'
import type { Store } from '@shukka/store'

function mysqlUrl(): string {
  const url = process.env.SHUKKA_DB_URL
  if (!url || !(url.startsWith('mysql://') || url.startsWith('mysql2://'))) {
    throw new Error('store-mysql tests require SHUKKA_DB_URL to be a MySQL URL')
  }
  return url
}

const appInput = {
  name: 'Acme',
  slug: 'acme-mysql',
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
  it('maps MySQL ER_DUP_ENTRY / 1062, including wrapped causes', () => {
    expect(isUniqueConstraint({ code: 'ER_DUP_ENTRY' })).toBe(true)
    expect(isUniqueConstraint({ errno: 1062 })).toBe(true)
    expect(isUniqueConstraint({ cause: { code: 'ER_DUP_ENTRY' } })).toBe(true)
    expect(isUniqueConstraint({ code: 'ER_NO_REFERENCED_ROW_2' })).toBe(false)
    expect(isUniqueConstraint({ errno: 1452 })).toBe(false)
    expect(isUniqueConstraint(new Error('nope'))).toBe(false)
  })
})

describe('mysqlAdapter.boot', () => {
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
    process.env.SHUKKA_DB_URL = mysqlUrl()
    process.env.SHUKKA_DB_DRIVER = 'mysql'

    store = await mysqlAdapter.boot()
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
    process.env.SHUKKA_DB_URL = mysqlUrl()
    process.env.SHUKKA_DB_DRIVER = 'mysql'

    store = await mysqlAdapter.boot()
    const sql = await mysql.createConnection(mysqlUrl())
    try {
      const [beforeRows] = await sql.query('SELECT COUNT(*) AS n FROM __drizzle_migrations')
      const before = Number((beforeRows as { n: unknown }[])[0]?.n)
      const [a, b] = await Promise.all([mysqlAdapter.boot(), mysqlAdapter.boot()])
      await a.ping()
      await b.ping()
      const [afterRows] = await sql.query('SELECT COUNT(*) AS n FROM __drizzle_migrations')
      const after = Number((afterRows as { n: unknown }[])[0]?.n)
      expect(after).toBe(before)
      expect(after).toBeGreaterThan(0)
    } finally {
      await sql.end()
    }
  })
})
