import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const objects = new Map<string, string>()

vi.mock('~/lib/runtime.ts', () => ({
  isCloudFunction: () => true,
}))

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

const { eq } = await import('drizzle-orm')
const { db } = await import('~/db/index.ts')
const { apps, hitBuckets, versions } = await import('~/db/schema.ts')
const { createApp } = await import('~/server/apps.ts')
const { finalizeUpload, initUpload } = await import('~/server/releases.ts')
const { resolveFeedRequest } = await import('~/server/feed.ts')
const { recordHit } = await import('~/server/hits.ts')

const ORIGIN = 'https://updates.test'

function metadataFor(version: string, installer: string) {
  return `version: ${version}\nfiles:\n  - url: ${installer}\n    sha512: aaa==\n    size: 10\npath: ${installer}\n`
}

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
  return { result: await finalizeUpload(app, init.uploadId, { release: true }), installer }
}

describe('feed hits on cloud functions', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('does not write hit rows or increment counters on /api/update/*', async () => {
    const app = await createApp({
      name: 'Acme',
      slug: 'acme',
      s3Endpoint: null,
      s3Region: 'us-east-1',
      s3Bucket: 'releases',
      s3Prefix: 'acme',
      s3AccessKeyId: 'key',
      s3SecretAccessKey: 'secret',
      s3ForcePathStyle: false,
    })
    const { result, installer } = await publish(app, 'stable', '1.0.0')

    const metadata = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    const artifact = await resolveFeedRequest('acme', 'stable', installer, ORIGIN)
    expect(metadata).toMatchObject({ kind: 'document' })
    expect(artifact).toMatchObject({ kind: 'redirect' })

    recordHit(result.versionId, 'metadata')
    recordHit(result.versionId, 'artifact')

    const row = db.select().from(versions).where(eq(versions.id, result.versionId)).get()
    expect(row?.metadataHits).toBe(0)
    expect(row?.artifactHits).toBe(0)
    expect(db.select().from(hitBuckets).where(eq(hitBuckets.versionId, result.versionId)).all()).toHaveLength(0)
  })
})
