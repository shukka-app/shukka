import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { bundledMigrations } from '../src/migrations.bundle.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('bundled migrations', () => {
  it('matches drizzle/ journal SQL and hashes', () => {
    const journal = JSON.parse(readFileSync(join(root, 'drizzle/meta/_journal.json'), 'utf8')) as {
      entries: { tag: string; when: number; breakpoints: boolean }[]
    }
    expect(bundledMigrations.map((entry) => entry.tag)).toEqual(journal.entries.map((entry) => entry.tag))
    for (const [index, entry] of journal.entries.entries()) {
      const body = readFileSync(join(root, 'drizzle', `${entry.tag}.sql`), 'utf8')
      expect(bundledMigrations[index]).toMatchObject({
        tag: entry.tag,
        when: entry.when,
        breakpoints: entry.breakpoints,
        hash: createHash('sha256').update(body).digest('hex'),
        body,
      })
    }
  })
})

describe('sqliteAdapter.boot', () => {
  const previousPath = process.env.SHUKKA_DB_PATH
  const previousDir = process.env.SHUKKA_DATA_DIR
  const previousUrl = process.env.SHUKKA_DB_URL

  afterEach(() => {
    if (previousPath === undefined) delete process.env.SHUKKA_DB_PATH
    else process.env.SHUKKA_DB_PATH = previousPath
    if (previousDir === undefined) delete process.env.SHUKKA_DATA_DIR
    else process.env.SHUKKA_DATA_DIR = previousDir
    if (previousUrl === undefined) delete process.env.SHUKKA_DB_URL
    else process.env.SHUKKA_DB_URL = previousUrl
  })

  it('connects, migrates, and serves the store port', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'store-sqlite-'))
    process.env.SHUKKA_DATA_DIR = dir
    process.env.SHUKKA_DB_PATH = join(dir, 'test.db')
    delete process.env.SHUKKA_DB_URL

    const { sqliteAdapter } = await import('../src/index.ts')
    const store = await sqliteAdapter.boot()
    await store.ping()

    const created = await store.createApp({
      name: 'Acme',
      slug: 'acme',
      s3Endpoint: null,
      s3Region: 'us-east-1',
      s3Bucket: 'releases',
      s3Prefix: '',
      s3AccessKeyId: 'key',
      s3SecretEncrypted: 'cipher',
      s3ForcePathStyle: false,
      updaterKind: 'electron',
    })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect((await store.listChannels(created.value.id)).map((channel) => channel.name)).toEqual(['stable'])

    const clash = await store.createApp({
      name: 'Acme',
      slug: 'acme',
      s3Endpoint: null,
      s3Region: 'us-east-1',
      s3Bucket: 'releases',
      s3Prefix: '',
      s3AccessKeyId: 'key',
      s3SecretEncrypted: 'cipher',
      s3ForcePathStyle: false,
      updaterKind: 'electron',
    })
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
      metadata: {},
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

    await store.recordHit(finalized.value.id, 'metadata', Math.floor(Date.now() / 1000))
    const version = await store.getVersionById(finalized.value.id)
    expect(version?.metadataHits).toBe(1)
    expect(await store.listHitBuckets(finalized.value.id)).toHaveLength(1)
  })
})
