import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** In-memory stand-in for S3 so the protocol invariants can be tested without a bucket. */
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
    getObjectText: vi.fn(async (_s3: unknown, key: string) => {
      const body = objects.get(key)
      if (body === undefined) {
        const { ShukkaError } = await import('~/lib/errors.ts')
        throw new ShukkaError('storage_error', 'Cannot read update metadata from storage')
      }
      return body
    }),
    deleteObjects: vi.fn(async (_s3: unknown, keys: string[]) => {
      for (const key of keys) objects.delete(key)
    }),
  }
})

const { eq } = await import('drizzle-orm')
const { db } = await import('~/db/index.ts')
const { apps, pendingUploads, versions } = await import('~/db/schema.ts')
const { createApp, DEFAULT_CHANNEL, updateApp } = await import('~/server/apps.ts')
const { createChannel, deleteChannel, getChannel, listChannelsForApps, listVersionsForChannels } =
  await import('~/server/channels.ts')
const { deleteVersion, finalizeUpload, initUpload, listArtifactsForVersions } = await import('~/server/releases.ts')
const { clearObjectCache } = await import('~/lib/object-cache.ts')
const { appDetail, appSummaries } = await import('~/server/dashboard.ts')
const { resolveFeedRequest } = await import('~/server/feed.ts')
const { ShukkaError } = await import('~/lib/errors.ts')
const { deleteObjects, isS3NotFound } = await import('~/lib/storage.ts')

const ORIGIN = 'https://updates.test'

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
async function publish(
  app: Awaited<ReturnType<typeof createApp>>,
  channel: string,
  version: string,
  installer = `Acme-Setup-${version}.exe`,
) {
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

beforeEach(() => {
  clearObjectCache()
})

describe('release flow', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('creates a default stable channel with the app', async () => {
    const app = await createApp(appInput)
    expect(getChannel(app.id, DEFAULT_CHANNEL).name).toBe(DEFAULT_CHANNEL)
  })

  it('keeps a pending upload invisible to the feed until finalize', async () => {
    const app = await createApp(appInput)
    await publish(app, 'stable', '1.0.0')

    const init = await initUpload(app, {
      channel: 'stable',
      version: '2.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-2.0.0.exe' }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename === 'latest.yml' ? metadataFor('2.0.0', 'Acme-Setup-2.0.0.exe') : 'binary')
    }

    const beforeFinalize = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect(beforeFinalize).toMatchObject({ kind: 'document' })
    expect((beforeFinalize as { body: string }).body).toContain('version: 1.0.0')

    await finalizeUpload(app, init.uploadId, { release: true })
    const afterFinalize = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((afterFinalize as { body: string }).body).toContain('version: 2.0.0')
  })

  it('finalizes as a draft by default and leaves the feed unchanged', async () => {
    const app = await createApp(appInput)
    await publish(app, 'stable', '1.0.0')

    const init = await initUpload(app, {
      channel: 'stable',
      version: '2.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-2.0.0.exe' }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename === 'latest.yml' ? metadataFor('2.0.0', 'Acme-Setup-2.0.0.exe') : 'binary')
    }
    await finalizeUpload(app, init.uploadId)

    const feed = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((feed as { body: string }).body).toContain('version: 1.0.0')
    await expect(resolveFeedRequest('acme', 'stable', 'Acme-Setup-2.0.0.exe', ORIGIN)).rejects.toThrow(/not found/)

    const { setCurrentVersion } = await import('~/server/channels.ts')
    setCurrentVersion(app.id, 'stable', '2.0.0')
    const afterPromote = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((afterPromote as { body: string }).body).toContain('version: 2.0.0')
    await expect(resolveFeedRequest('acme', 'stable', 'Acme-Setup-2.0.0.exe', ORIGIN)).resolves.toMatchObject({ kind: 'redirect' })
  })

  it('hides a draft-only channel from the feed the same as an empty one', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.0.0.exe' }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename === 'latest.yml' ? metadataFor('1.0.0', 'Acme-Setup-1.0.0.exe') : 'binary')
    }
    await finalizeUpload(app, init.uploadId)
    await expect(resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)).rejects.toThrow(/no published version/)
    await expect(resolveFeedRequest('acme', 'stable', 'Acme-Setup-1.0.0.exe', ORIGIN)).rejects.toThrow(
      /no published version/,
    )
  })

  it('falls back to the latest released version, skipping drafts, when current is deleted', async () => {
    const app = await createApp(appInput)
    const first = await publish(app, 'stable', '1.0.0')
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.5.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.5.0.exe' }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename === 'latest.yml' ? metadataFor('1.5.0', 'Acme-Setup-1.5.0.exe') : 'binary')
    }
    const draft = await finalizeUpload(app, init.uploadId)
    const live = await publish(app, 'stable', '2.0.0')

    await deleteVersion(app, live.result.versionId)
    expect(getChannel(app.id, 'stable').currentVersionId).toBe(first.result.versionId)
    expect(db.select().from(versions).where(eq(versions.id, draft.versionId)).get()?.releasedAt).toBeNull()
  })

  it('rejects a channel name that is not a URL token', async () => {
    const app = await createApp(appInput)
    expect(() => createChannel(app.id, 'beta.1')).toThrow(/dash or underscore/)
    expect(() => createChannel(app.id, 'Beta')).toThrow(/dash or underscore/)
  })

  it('serves metadata verbatim and redirects artifacts', async () => {
    const app = await createApp(appInput)
    const { installer } = await publish(app, 'stable', '1.0.0')

    const metadata = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect(metadata).toEqual({
      kind: 'document',
      contentType: 'text/yaml; charset=utf-8',
      body: metadataFor('1.0.0', installer),
    })

    const artifact = await resolveFeedRequest('acme', 'stable', installer, ORIGIN)
    expect(artifact.kind).toBe('redirect')
    expect((artifact as { url: string }).url).toContain('acme/stable/1.0.0/')
  })

  it('counts metadata checks and artifact downloads per version', async () => {
    const app = await createApp(appInput)
    const { installer, result } = await publish(app, 'stable', '1.0.0')

    await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    await resolveFeedRequest('acme', 'stable', installer, ORIGIN)

    const row = db.select().from(versions).where(eq(versions.id, result.versionId)).get()
    expect(row?.metadataHits).toBe(2)
    expect(row?.artifactHits).toBe(1)
  })

  it('rejects a duplicate version on the same channel', async () => {
    const app = await createApp(appInput)
    await publish(app, 'stable', '1.0.0')
    await expect(publish(app, 'stable', '1.0.0')).rejects.toThrow(/already exists/)
  })

  it('rejects a second init while a pending upload is in flight', async () => {
    const app = await createApp(appInput)
    await initUpload(app, {
      channel: 'stable',
      version: '1.0.1',
      files: [{ filename: 'latest.yml' }],
    })
    await expect(
      initUpload(app, {
        channel: 'stable',
        version: '1.0.1',
        files: [{ filename: 'latest.yml' }],
      }),
    ).rejects.toMatchObject({
      name: 'ShukkaError',
      code: 'conflict',
      message: 'Version 1.0.1 already has a pending upload',
    })
  })

  it('allows re-init after an expired pending upload is cleaned up', async () => {
    const app = await createApp(appInput)
    const first = await initUpload(app, {
      channel: 'stable',
      version: '1.0.1',
      files: [{ filename: 'latest.yml' }],
    })
    db.update(pendingUploads).set({ expiresAt: 1 }).where(eq(pendingUploads.id, first.uploadId)).run()
    await expect(
      initUpload(app, {
        channel: 'stable',
        version: '1.0.1',
        files: [{ filename: 'latest.yml' }],
      }),
    ).resolves.toMatchObject({ files: expect.any(Array) })
  })

  it('deletes stored objects when an expired pending upload is purged on init', async () => {
    const app = await createApp(appInput)
    const first = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.0.0.exe' }],
    })
    for (const file of first.files) {
      objects.set(file.key, file.filename === 'latest.yml' ? metadataFor('1.0.0', 'Acme-Setup-1.0.0.exe') : 'binary')
    }
    db.update(pendingUploads).set({ expiresAt: 1 }).where(eq(pendingUploads.id, first.uploadId)).run()

    const second = await initUpload(app, {
      channel: 'stable',
      version: '1.1.0',
      files: [{ filename: 'latest.yml' }],
    })
    expect(second.uploadId).toBeTruthy()
    for (const file of first.files) expect(objects.has(file.key)).toBe(false)
    expect(db.select().from(pendingUploads).where(eq(pendingUploads.id, first.uploadId)).get()).toBeUndefined()
  })

  it('deletes stored objects when finalize rejects an expired upload', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }],
    })
    objects.set(init.files[0].key, metadataFor('1.0.0', 'latest.yml'))
    db.update(pendingUploads).set({ expiresAt: 1 }).where(eq(pendingUploads.id, init.uploadId)).run()

    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/expired/)
    expect(objects.has(init.files[0].key)).toBe(false)
  })

  it('does not finalize a re-init against leftover bytes from an expired upload', async () => {
    const app = await createApp(appInput)
    const first = await initUpload(app, {
      channel: 'stable',
      version: '2.0.0',
      files: [{ filename: 'latest.yml' }],
    })
    objects.set(first.files[0].key, metadataFor('2.0.0', 'latest.yml'))
    db.update(pendingUploads).set({ expiresAt: 1 }).where(eq(pendingUploads.id, first.uploadId)).run()

    const second = await initUpload(app, {
      channel: 'stable',
      version: '2.0.0',
      files: [{ filename: 'latest.yml' }],
    })
    await expect(finalizeUpload(app, second.uploadId)).rejects.toThrow(/was not uploaded/)
  })

  it('keeps expired pending rows when object cleanup fails', async () => {
    const app = await createApp(appInput)
    const first = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }],
    })
    objects.set(first.files[0].key, metadataFor('1.0.0', 'latest.yml'))
    db.update(pendingUploads).set({ expiresAt: 1 }).where(eq(pendingUploads.id, first.uploadId)).run()

    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(deleteObjects).mockRejectedValueOnce(new Error('s3 down'))
    try {
      await expect(
        initUpload(app, {
          channel: 'stable',
          version: '1.1.0',
          files: [{ filename: 'latest.yml' }],
        }),
      ).resolves.toMatchObject({ files: expect.any(Array) })
      expect(db.select().from(pendingUploads).where(eq(pendingUploads.id, first.uploadId)).get()).toBeDefined()
      expect(objects.has(first.files[0].key)).toBe(true)
    } finally {
      log.mockRestore()
    }
  })

  it('maps a unique version insert during finalize to conflict', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.1',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.0.1.exe' }],
    })
    objects.set(init.files[0].key, metadataFor('1.0.1', 'Acme-Setup-1.0.1.exe'))
    objects.set(init.files[1].key, 'binary')
    const channel = getChannel(app.id, 'stable')
    db.insert(versions)
      .values({
        appId: app.id,
        channelId: channel.id,
        version: '1.0.1',
        createdAt: Math.floor(Date.now() / 1000),
      })
      .run()

    await expect(finalizeUpload(app, init.uploadId)).rejects.toMatchObject({
      name: 'ShukkaError',
      code: 'conflict',
      message: 'Version already exists',
    })
  })

  it('keeps the version row when storage delete fails', async () => {
    const app = await createApp(appInput)
    const published = await publish(app, 'stable', '1.0.0')
    vi.mocked(deleteObjects).mockRejectedValueOnce(new Error('s3 down'))
    await expect(deleteVersion(app, published.result.versionId)).rejects.toThrow()
    expect(db.select().from(versions).where(eq(versions.id, published.result.versionId)).get()).toBeDefined()
  })

  it('treats only S3 not-found shapes as a missing object', () => {
    expect(isS3NotFound({ name: 'NotFound' })).toBe(true)
    expect(isS3NotFound({ name: 'NoSuchKey' })).toBe(true)
    expect(isS3NotFound({ $metadata: { httpStatusCode: 404 } })).toBe(true)
    expect(isS3NotFound({ name: 'TimeoutError' })).toBe(false)
    expect(isS3NotFound({ $metadata: { httpStatusCode: 403 } })).toBe(false)
    expect(isS3NotFound(new Error('network'))).toBe(false)
  })

  it('allows the same version string on a different channel', async () => {
    const app = await createApp(appInput)
    createChannel(app.id, 'beta')
    await publish(app, 'stable', '1.0.0')
    await expect(publish(app, 'beta', '1.0.0')).resolves.toBeDefined()
  })

  it('refuses to finalize when an artifact was never uploaded', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.0.0.exe' }],
    })
    objects.set(init.files[0].key, metadataFor('1.0.0', 'Acme-Setup-1.0.0.exe'))

    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/was not uploaded/)
    expect(getChannel(app.id, 'stable').currentVersionId).toBeNull()
  })

  it('refuses metadata that disagrees with the declared version', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.0.0.exe' }],
    })
    objects.set(init.files[0].key, metadataFor('9.9.9', 'Acme-Setup-1.0.0.exe'))
    objects.set(init.files[1].key, 'binary')

    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(ShukkaError)
  })

  it('rejects metadata larger than the size limit', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }],
    })
    objects.set(init.files[0].key, 'version: 1.0.0\n' + 'x'.repeat(1024 * 1024))

    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/metadata size limit/)
    expect(db.select().from(versions).all()).toEqual([])
  })

  it('does not leak storage internals when the public feed cannot read metadata', async () => {
    const app = await createApp(appInput)
    await publish(app, 'stable', '1.0.0')
    const ymlKey = [...objects.keys()].find((key) => key.endsWith('/latest.yml'))
    expect(ymlKey).toBeDefined()
    objects.delete(ymlKey!)

    const error = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN).catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ShukkaError)
    const message = (error as InstanceType<typeof ShukkaError>).message
    expect(message).not.toContain(ymlKey!)
    expect(message).toBe('Cannot read update metadata from storage')
    expect((error as InstanceType<typeof ShukkaError>).details).toBeUndefined()
  })

  it('requires at least one metadata file', async () => {
    const app = await createApp(appInput)
    await expect(
      initUpload(app, { channel: 'stable', version: '1.0.0', files: [{ filename: 'Acme.exe' }] }),
    ).rejects.toThrow(/metadata file/)
  })

  it('does not create an unknown channel unless asked', async () => {
    const app = await createApp(appInput)
    await expect(
      initUpload(app, { channel: 'nightly', version: '1.0.0', files: [{ filename: 'latest.yml' }] }),
    ).rejects.toThrow(/not found/)

    const init = await initUpload(app, {
      channel: 'nightly',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }],
      createChannel: true,
    })
    expect(init.uploadId).toBeTruthy()
  })

  it('rolls the feed back when currentVersion is pointed at an older released version', async () => {
    const app = await createApp(appInput)
    const first = await publish(app, 'stable', '1.0.0')
    const second = await publish(app, 'stable', '2.0.0')

    const live = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((live as { body: string }).body).toContain('version: 2.0.0')

    const { setCurrentVersion } = await import('~/server/channels.ts')
    setCurrentVersion(app.id, 'stable', '1.0.0')

    const rolled = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((rolled as { body: string }).body).toContain('version: 1.0.0')
    expect(getChannel(app.id, 'stable').currentVersionId).toBe(first.result.versionId)
    await expect(resolveFeedRequest('acme', 'stable', second.installer, ORIGIN)).resolves.toMatchObject({
      kind: 'redirect',
    })
    expect(db.select().from(versions).where(eq(versions.id, first.result.versionId)).get()?.releasedAt).not.toBeNull()
    expect(db.select().from(versions).where(eq(versions.id, second.result.versionId)).get()?.releasedAt).not.toBeNull()
  })

  it('resolves a shared artifact filename to the current version first', async () => {
    const app = await createApp(appInput)
    const first = await publish(app, 'stable', '1.0.0', 'MyApp.AppImage')
    await publish(app, 'stable', '2.0.0', 'MyApp.AppImage')

    const live = await resolveFeedRequest('acme', 'stable', 'MyApp.AppImage', ORIGIN)
    expect(live.kind).toBe('redirect')
    expect((live as { url: string }).url).toContain('/2.0.0/')

    const { setCurrentVersion } = await import('~/server/channels.ts')
    setCurrentVersion(app.id, 'stable', '1.0.0')

    const rolled = await resolveFeedRequest('acme', 'stable', 'MyApp.AppImage', ORIGIN)
    expect(rolled.kind).toBe('redirect')
    expect((rolled as { url: string }).url).toContain('/1.0.0/')
    expect(db.select().from(versions).where(eq(versions.id, first.result.versionId)).get()?.artifactHits).toBe(1)
  })

  it('serves fresh metadata after a version is deleted and republished', async () => {
    const app = await createApp(appInput)
    const first = await publish(app, 'stable', '1.0.0')

    const warmed = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((warmed as { body: string }).body).toContain('version: 1.0.0')

    await deleteVersion(app, first.result.versionId)
    await publish(app, 'stable', '1.0.0')

    const ymlKey = [...objects.keys()].find((key) => key.endsWith('/latest.yml'))
    expect(ymlKey).toBeDefined()
    objects.set(ymlKey!, `${objects.get(ymlKey!)!}#republished\n`)

    const fresh = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((fresh as { body: string }).body).toContain('#republished')
  })

  it('serves fresh metadata after app storage settings change', async () => {
    const app = await createApp(appInput)
    await publish(app, 'stable', '1.0.0')

    const warmed = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((warmed as { body: string }).body).toContain('version: 1.0.0')

    await updateApp(app.id, { ...appInput, s3Bucket: 'other-bucket' })

    const ymlKey = [...objects.keys()].find((key) => key.endsWith('/latest.yml'))
    expect(ymlKey).toBeDefined()
    objects.set(ymlKey!, `${objects.get(ymlKey!)!}#repointed\n`)

    const fresh = await resolveFeedRequest('acme', 'stable', 'latest.yml', ORIGIN)
    expect((fresh as { body: string }).body).toContain('#repointed')
  })

  it('falls back to the previous version when the current one is deleted', async () => {
    const app = await createApp(appInput)
    const first = await publish(app, 'stable', '1.0.0')
    const second = await publish(app, 'stable', '2.0.0')

    await deleteVersion(app, second.result.versionId)
    expect(getChannel(app.id, 'stable').currentVersionId).toBe(first.result.versionId)

    await deleteVersion(app, first.result.versionId)
    expect(getChannel(app.id, 'stable').currentVersionId).toBeNull()
  })

  it('404s the feed for a channel with no published version', async () => {
    const app = await createApp(appInput)
    createChannel(app.id, 'beta')
    await expect(resolveFeedRequest('acme', 'beta', 'latest.yml', ORIGIN)).rejects.toThrow(/no published version/)
  })
})

describe('destructive operations', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('deletes stored objects when a channel is removed', async () => {
    const app = await createApp(appInput)
    createChannel(app.id, 'beta')
    await publish(app, 'stable', '1.0.0')
    await publish(app, 'beta', '1.0.0')

    const betaKeys = [...objects.keys()].filter((key) => key.includes('/beta/'))
    expect(betaKeys.length).toBeGreaterThan(0)

    await deleteChannel(app, getChannel(app.id, 'beta').id)

    expect([...objects.keys()].some((key) => key.includes('/beta/'))).toBe(false)
    // The other channel's objects are untouched.
    expect([...objects.keys()].some((key) => key.includes('/stable/'))).toBe(true)
  })
})

describe('input validation', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('rejects version strings that would escape the object key layout', async () => {
    const app = await createApp(appInput)
    for (const version of ['../evil', 'a/b', '.hidden', 'a\\b', '1.0.0/../..']) {
      await expect(
        initUpload(app, { channel: 'stable', version, files: [{ filename: 'latest.yml' }] }),
      ).rejects.toThrow(/Invalid version string/)
    }
  })

  it('rejects artifact filenames containing path separators', async () => {
    const app = await createApp(appInput)
    await expect(
      initUpload(app, {
        channel: 'stable',
        version: '1.0.0',
        files: [{ filename: 'latest.yml' }, { filename: '../escape.exe' }],
      }),
    ).rejects.toThrow(/Invalid artifact filename/)
  })

  it('rejects artifact filenames containing ..', async () => {
    const app = await createApp(appInput)
    await expect(
      initUpload(app, {
        channel: 'stable',
        version: '1.0.0',
        files: [{ filename: 'app..v2.yml' }],
      }),
    ).rejects.toThrow(/Invalid artifact filename/)
  })
})

describe('metadata consistency', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('refuses metadata that references a file outside the upload', async () => {
    const app = await createApp(appInput)
    const init = await initUpload(app, {
      channel: 'stable',
      version: '1.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-1.0.0.exe' }],
    })
    // The yml points at a file that was never part of the upload.
    objects.set(init.files[0].key, metadataFor('1.0.0', 'Acme-Setup-1.0.0.dmg'))
    objects.set(init.files[1].key, 'binary')

    await expect(finalizeUpload(app, init.uploadId)).rejects.toThrow(/were not uploaded/)
  })
})

describe('dashboard appDetail shape', () => {
  beforeEach(() => {
    db.delete(apps).run()
    objects.clear()
  })

  it('returns empty results for empty id batches without querying', () => {
    expect(listChannelsForApps([])).toEqual([])
    expect(listVersionsForChannels([])).toEqual([])
    expect(listArtifactsForVersions([])).toEqual([])
  })

  it('keeps channel, version, and artifact counts and currentVersion after batching', async () => {
    const app = await createApp(appInput)
    createChannel(app.id, 'beta')
    await publish(app, 'stable', '1.0.0')
    await publish(app, 'beta', '2.0.0')

    const detail = appDetail(app.id, ORIGIN)
    // Recorded from appDetail before the batch rewrite (two channels, one version each).
    expect(detail.channels).toHaveLength(2)
    expect(detail.channels.map((channel) => channel.name)).toEqual(['stable', 'beta'])
    expect(detail.channels.map((channel) => channel.versions.length)).toEqual([1, 1])
    expect(detail.channels.map((channel) => channel.versions[0]?.artifacts.length)).toEqual([2, 2])
    expect(detail.channels.map((channel) => channel.versions[0]?.version)).toEqual(['1.0.0', '2.0.0'])
    expect(detail.channels.map((channel) => channel.versions[0]?.isCurrent)).toEqual([true, true])
    expect(detail.channels.map((channel) => channel.currentVersionId)).toEqual(
      detail.channels.map((channel) => channel.versions[0]?.id),
    )
    expect(detail.channels[0]?.versions[0]?.artifacts.map((artifact) => artifact.filename)).toEqual([
      'Acme-Setup-1.0.0.exe',
      'latest.yml',
    ])
    expect(detail.channels[1]?.versions[0]?.artifacts.map((artifact) => artifact.filename)).toEqual([
      'Acme-Setup-2.0.0.exe',
      'latest.yml',
    ])
    expect(detail.channels[0]?.feedUrl).toBe(`${ORIGIN}/api/update/acme/stable`)
    expect(detail).toHaveProperty('keys')

    const withoutKeys = appDetail(app.id, ORIGIN, { includeKeys: false })
    expect(withoutKeys).not.toHaveProperty('keys')
    expect(withoutKeys.channels.map((channel) => channel.name)).toEqual(['stable', 'beta'])

    const summaries = appSummaries()
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.channels.map((channel) => ({ name: channel.name, currentVersion: channel.currentVersion }))).toEqual([
      { name: 'stable', currentVersion: '1.0.0' },
      { name: 'beta', currentVersion: '2.0.0' },
    ])
  })

  it('does not crash for an app with a channel and zero versions', async () => {
    const app = await createApp(appInput)
    const detail = appDetail(app.id, ORIGIN)
    expect(detail.channels).toHaveLength(1)
    expect(detail.channels[0]?.name).toBe('stable')
    expect(detail.channels[0]?.versions).toEqual([])
    expect(detail.channels[0]?.currentVersionId).toBeNull()
    expect(appSummaries()[0]?.channels).toEqual([{ id: detail.channels[0]?.id, name: 'stable', currentVersion: null }])
  })
})
