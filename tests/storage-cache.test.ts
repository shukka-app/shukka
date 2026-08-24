import './setup-db.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '~/db/index.ts'
import { apps, type App } from '~/db/schema.ts'
import { encryptSecret } from '~/lib/crypto.ts'
import { evictAppStorage, settingsFromApp } from '~/lib/storage.ts'

function insertApp(): App {
  return db
    .insert(apps)
    .values({
      name: 'Cache',
      slug: `cache-${crypto.randomUUID()}`,
      s3Endpoint: null,
      s3Region: 'us-east-1',
      s3Bucket: 'releases',
      s3Prefix: 'cache',
      s3AccessKeyId: 'key',
      s3SecretEncrypted: encryptSecret('secret'),
      s3ForcePathStyle: false,
    })
    .returning()
    .get()
}

afterEach(() => {
  const rows = db.select({ id: apps.id }).from(apps).all()
  for (const row of rows) evictAppStorage(row.id)
  db.delete(apps).run()
})

describe('per-app storage cache', () => {
  it('returns the same settings object for the same App row', () => {
    const app = insertApp()
    expect(settingsFromApp(app)).toBe(settingsFromApp(app))
  })

  it('returns a fresh settings object after eviction', () => {
    const app = insertApp()
    const first = settingsFromApp(app)
    evictAppStorage(app.id)
    const second = settingsFromApp(app)
    expect(second).not.toBe(first)
    expect(second).toEqual(first)
  })

  it('returns fresh settings when the secret fingerprint changes', () => {
    const app = insertApp()
    const first = settingsFromApp(app)
    const rotated: App = { ...app, s3SecretEncrypted: encryptSecret('other-secret') }
    const second = settingsFromApp(rotated)
    expect(second).not.toBe(first)
    expect(second.secretAccessKey).toBe('other-secret')
  })
})
