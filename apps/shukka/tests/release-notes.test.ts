import './setup-db.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** In-memory stand-in for S3, same harness as hits.test.ts. */
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

const { eq } = await import('drizzle-orm')
const { db } = await import('~/db/index.ts')
const { apps, releaseNotes } = await import('~/db/schema.ts')
const { createApp, getApp } = await import('~/server/apps.ts')
const { createChannel } = await import('~/server/channels.ts')
const { deleteVersion, finalizeUpload, initUpload } = await import('~/server/releases.ts')
const notesServer = await import('~/server/release-notes.ts')
const { verifyWritable } = await import('~/lib/storage.ts')
const { ShukkaError } = await import('~/lib/errors.ts')
const notesRoute = await import('~/routes/api/v1/apps.$appSlug.channels.$channel.notes.ts')

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
  return finalizeUpload(app, init.uploadId, { release: true })
}

/** Creates the app with the release log enabled for en-US + zh-CN. */
async function enabledApp(locales = ['en-US', 'zh-CN'], fallbackLocale = 'en-US') {
  const app = await createApp(appInput)
  await notesServer.updateNotesConfig(app.id, { enabled: true, locales, fallbackLocale })
  return app
}

type ServerRoute = {
  options: {
    server?: {
      handlers?: Record<string, (ctx: { request: Request; params: Record<string, string | undefined> }) => Promise<Response>>
    }
  }
}

/** Calls a server-route handler directly — no session cookie anywhere. */
function routeHandler(route: unknown, method: string) {
  const handler = (route as ServerRoute).options.server?.handlers?.[method]
  if (!handler) throw new Error(`Route has no ${method} handler`)
  return handler
}

beforeEach(async () => {
  await db.delete(apps).run()
  objects.clear()
})

describe('updateNotesConfig', () => {
  it('saves the config without ever probing S3 storage', async () => {
    const app = await createApp(appInput)
    vi.mocked(verifyWritable).mockClear()

    const saved = await notesServer.updateNotesConfig(app.id, {
      enabled: true,
      locales: ['zh-CN', 'en-US', 'en-US'],
      fallbackLocale: 'zh-CN',
    })

    expect(verifyWritable).not.toHaveBeenCalled()
    expect(saved).toEqual({ enabled: true, locales: ['zh-CN', 'en-US'], fallbackLocale: 'zh-CN' })
    const stored = await getApp(app.id)
    expect(stored.releaseLogEnabled).toBe(true)
    expect(stored.releaseLogFallbackLocale).toBe('zh-CN')
  })

  it('validates locales and fallback when enabling', async () => {
    const app = await createApp(appInput)
    await expect(notesServer.updateNotesConfig(app.id, { enabled: true, locales: [], fallbackLocale: 'en-US' })).rejects.toThrow(
      /at least one locale/i,
    )
    await expect(
      notesServer.updateNotesConfig(app.id, { enabled: true, locales: ['en-US'], fallbackLocale: 'fr-FR' }),
    ).rejects.toThrow(/fallback locale/i)
    await expect(
      notesServer.updateNotesConfig(app.id, { enabled: true, locales: ['not a locale'], fallbackLocale: 'en-US' }),
    ).rejects.toThrow(ShukkaError)
    // Disabled apps may hold an empty list; the fallback stays at its default.
    expect(await notesServer.updateNotesConfig(app.id, { enabled: false, locales: [], fallbackLocale: 'en-US' })).toEqual({
      enabled: false,
      locales: [],
      fallbackLocale: 'en-US',
    })
  })

  it('stores config locales in canonical form so case variants collapse', async () => {
    const app = await createApp(appInput)
    const saved = await notesServer.updateNotesConfig(app.id, {
      enabled: true,
      locales: ['en-us'],
      fallbackLocale: 'en-US',
    })
    expect(saved).toEqual({ enabled: true, locales: ['en-US'], fallbackLocale: 'en-US' })
    const stored = await getApp(app.id)
    expect(stored.releaseLogFallbackLocale).toBe('en-US')
    expect(JSON.parse(stored.releaseLogLocales)).toEqual(['en-US'])
  })
})

describe('upsertNote', () => {
  it('stores markdown, sanitized html and plain text at write time', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    const markdown = '# What’s new\n\nSome **bold** fix.\n\n<script>alert(1)</script>'

    const note = await notesServer.upsertNote(app.id, versionId, 'en-US', markdown)

    expect(note.markdown).toBe(markdown)
    expect(note.html).toContain('<strong>bold</strong>')
    expect(note.html).not.toContain('<script>')
    expect(note.text).toContain('What’s new')
    expect(note.text).toContain('bold')
    expect(note.text).not.toContain('**')
    expect(note.text).not.toContain('<script>')
  })

  it('upserts on (version, locale) and re-renders', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')

    await notesServer.upsertNote(app.id, versionId, 'en-US', 'first')
    const updated = await notesServer.upsertNote(app.id, versionId, 'en-US', '**second**')

    expect(updated.markdown).toBe('**second**')
    expect(updated.html).toContain('<strong>second</strong>')
    expect(await notesServer.listNotes(app.id, versionId)).toHaveLength(1)
  })

  it('collapses case-variant upserts of the same locale into one row', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')

    await notesServer.upsertNote(app.id, versionId, 'en-us', 'first')
    const updated = await notesServer.upsertNote(app.id, versionId, 'en-US', 'second')

    expect(updated.markdown).toBe('second')
    expect(updated.locale).toBe('en-US')
    expect(await notesServer.listNotes(app.id, versionId)).toHaveLength(1)
  })

  it('rejects writes while the release log is disabled', async () => {
    const app = await createApp(appInput)
    const { versionId } = await publish(app, 'stable', '1.0.0')

    await expect(notesServer.upsertNote(app.id, versionId, 'en-US', 'hi')).rejects.toThrow(/not enabled/)
    await expect(notesServer.deleteNote(app.id, versionId, 'en-US')).rejects.toThrow(/not enabled/)
  })

  it('rejects invalid locale tags, empty markdown and foreign versions', async () => {
    const app = await enabledApp()
    const other = await createApp({ ...appInput, name: 'Other', slug: 'other' })
    await notesServer.updateNotesConfig(other.id, { enabled: true, locales: ['en-US'], fallbackLocale: 'en-US' })
    const { versionId } = await publish(app, 'stable', '1.0.0')

    await expect(notesServer.upsertNote(app.id, versionId, 'not a locale', 'hi')).rejects.toThrow(/Invalid locale/)
    await expect(notesServer.upsertNote(app.id, versionId, 'en-US', '   ')).rejects.toThrow(/must not be empty/)
    await expect(notesServer.upsertNote(other.id, versionId, 'en-US', 'hi')).rejects.toThrow(/not found/i)
  })
})

describe('publicNotes range semantics', () => {
  it('resolves from inclusive / to exclusive over the channel timeline, newest first', async () => {
    const app = await enabledApp()
    for (const version of ['1.1.0', '1.2.0', '1.3.0', '1.4.0']) {
      const { versionId } = await publish(app, 'stable', version)
      await notesServer.upsertNote(app.id, versionId, 'en-US', `notes for ${version}`)
    }
    await createChannel(app.id, 'beta')
    const beta = await publish(app, 'beta', '1.3.5')
    await notesServer.upsertNote(app.id, beta.versionId, 'en-US', 'beta notes')

    const ranged = await notesServer.publicNotes('acme', 'stable', { from: '1.2.0', to: '1.4.0', locale: null })
    expect(ranged.notes.map((note) => note.version)).toEqual(['1.3.0', '1.2.0'])

    const open = await notesServer.publicNotes('acme', 'stable', { from: '1.2.0', to: null, locale: null })
    expect(open.notes.map((note) => note.version)).toEqual(['1.4.0', '1.3.0', '1.2.0'])

    // The beta channel's versions never mix in.
    const betaOnly = await notesServer.publicNotes('acme', 'beta', { from: null, to: null, locale: null })
    expect(betaOnly.notes.map((note) => note.version)).toEqual(['1.3.5'])
  })

  it('is loud about unknown range bounds', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-US', 'notes')

    await expect(notesServer.publicNotes('acme', 'stable', { from: '9.9.9', to: null, locale: null })).rejects.toThrow(
      ShukkaError,
    )
    await expect(notesServer.publicNotes('acme', 'stable', { from: '1.0.0', to: '9.9.9', locale: null })).rejects.toThrow(
      /not found on this channel/,
    )
  })

  it('returns the latest 10 versions that have notes when from is empty', async () => {
    const app = await enabledApp()
    for (let index = 1; index <= 12; index += 1) {
      const { versionId } = await publish(app, 'stable', `1.0.${index}`)
      // The newest version carries no note — it must be skipped.
      if (index <= 11) await notesServer.upsertNote(app.id, versionId, 'en-US', `notes ${index}`)
    }

    const result = await notesServer.publicNotes('acme', 'stable', { from: null, to: null, locale: null })
    expect(result.notes).toHaveLength(10)
    expect(result.notes.map((note) => note.version)).toEqual([
      '1.0.11',
      '1.0.10',
      '1.0.9',
      '1.0.8',
      '1.0.7',
      '1.0.6',
      '1.0.5',
      '1.0.4',
      '1.0.3',
      '1.0.2',
    ])
  })
})

describe('publicNotes locale fallback chain', () => {
  it('resolves a case-variant stored note via the fallback chain', async () => {
    const app = await enabledApp(['en-US'], 'en-US')
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-us', 'english notes')

    const result = await notesServer.publicNotes('acme', 'stable', { from: null, to: null, locale: null })
    expect(result.notes.map((note) => [note.version, note.locale, note.markdown])).toEqual([
      ['1.0.0', 'en-US', 'english notes'],
    ])
  })

  it('resolves a case-variant ?locale query to a stored canonical note', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-US', 'english notes')

    const result = await notesServer.publicNotes('acme', 'stable', { from: null, to: null, locale: 'EN-US' })
    expect(result.notes.map((note) => [note.version, note.locale, note.markdown])).toEqual([
      ['1.0.0', 'en-US', 'english notes'],
    ])
  })

  it('resolves requested exact → app fallback → first available → omit', async () => {
    const app = await enabledApp(['en-US', 'zh-CN'], 'en-US')
    const full = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, full.versionId, 'zh-CN', '中文说明')
    await notesServer.upsertNote(app.id, full.versionId, 'en-US', 'english notes')
    const partial = await publish(app, 'stable', '1.1.0')
    await notesServer.upsertNote(app.id, partial.versionId, 'ja-JP', '日本語メモ')
    await publish(app, 'stable', '1.2.0') // no notes at all — omitted

    const exact = await notesServer.publicNotes('acme', 'stable', { from: '1.0.0', to: null, locale: 'zh-CN' })
    expect(exact.notes.map((note) => [note.version, note.locale, note.markdown])).toEqual([
      ['1.1.0', 'ja-JP', '日本語メモ'], // requested miss → fallback miss → first available
      ['1.0.0', 'zh-CN', '中文说明'], // requested exact match
    ])

    const fallback = await notesServer.publicNotes('acme', 'stable', { from: '1.0.0', to: null, locale: 'fr-FR' })
    expect(fallback.notes.map((note) => [note.version, note.locale])).toEqual([
      ['1.1.0', 'ja-JP'],
      ['1.0.0', 'en-US'], // requested miss → app fallback
    ])

    const absent = await notesServer.publicNotes('acme', 'stable', { from: '1.0.0', to: null, locale: null })
    expect(absent.notes.map((note) => [note.version, note.locale])).toEqual([
      ['1.1.0', 'ja-JP'],
      ['1.0.0', 'en-US'], // no requested locale → app fallback
    ])
  })
})

describe('publicNotes gating and errors', () => {
  it('omits draft versions even when they have notes', async () => {
    const app = await enabledApp()
    const live = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, live.versionId, 'en-US', 'live notes')

    const init = await initUpload(app, {
      channel: 'stable',
      version: '2.0.0',
      files: [{ filename: 'latest.yml' }, { filename: 'Acme-Setup-2.0.0.exe' }],
    })
    for (const file of init.files) {
      objects.set(file.key, file.filename === 'latest.yml' ? metadataFor('2.0.0', 'Acme-Setup-2.0.0.exe') : 'binary')
    }
    const draft = await finalizeUpload(app, init.uploadId)
    await notesServer.upsertNote(app.id, draft.versionId, 'en-US', 'secret draft')

    expect(
      (await notesServer.publicNotes('acme', 'stable', { from: null, to: null, locale: null })).notes.map((note) => note.version),
    ).toEqual(['1.0.0'])
  })

  it('returns no data for apps without the release log enabled', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-US', 'notes')

    await notesServer.updateNotesConfig(app.id, { enabled: false, locales: [], fallbackLocale: 'en-US' })
    expect(await notesServer.publicNotes('acme', 'stable', { from: null, to: null, locale: null })).toEqual({ notes: [] })

    const plain = await createApp({ ...appInput, name: 'Plain', slug: 'plain' })
    await publish(plain, 'stable', '1.0.0')
    expect(await notesServer.publicNotes('plain', 'stable', { from: null, to: null, locale: null })).toEqual({ notes: [] })
  })

  it('rejects unknown apps and channels as not_found', async () => {
    await enabledApp()
    await expect(notesServer.publicNotes('nope', 'stable', { from: null, to: null, locale: null })).rejects.toThrow(ShukkaError)
    await expect(notesServer.publicNotes('acme', 'nope', { from: null, to: null, locale: null })).rejects.toThrow(/not found/i)
  })
})

describe('public notes route', () => {
  it('serves notes without any session and keeps the feed error envelope', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-US', 'hello')
    const GET = routeHandler(notesRoute.Route, 'GET')

    const ok = await GET({
      request: new Request('https://shukka.test/api/v1/apps/acme/channels/stable/notes'),
      params: { appSlug: 'acme', channel: 'stable' },
    })
    expect(ok.status).toBe(200)
    const body = (await ok.json()) as { notes: { version: string; locale: string }[] }
    expect(body.notes).toHaveLength(1)
    expect(body.notes[0]).toMatchObject({ version: '1.0.0', locale: 'en-US' })

    const missing = await GET({
      request: new Request('https://shukka.test/api/v1/apps/nope/channels/stable/notes'),
      params: { appSlug: 'nope', channel: 'stable' },
    })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ error: 'not_found' })
  })
})

describe('release notes lifecycle', () => {
  it('cascades notes when the version is deleted', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-US', 'english')
    await notesServer.upsertNote(app.id, versionId, 'zh-CN', '中文')

    await deleteVersion(await getApp(app.id), versionId)
    expect(await db.select().from(releaseNotes).where(eq(releaseNotes.versionId, versionId)).all()).toHaveLength(0)
  })

  it('deletes a single locale note and complains about missing ones', async () => {
    const app = await enabledApp()
    const { versionId } = await publish(app, 'stable', '1.0.0')
    await notesServer.upsertNote(app.id, versionId, 'en-US', 'english')

    await notesServer.deleteNote(app.id, versionId, 'en-US')
    expect(await notesServer.listNotes(app.id, versionId)).toHaveLength(0)
    await expect(notesServer.deleteNote(app.id, versionId, 'en-US')).rejects.toThrow(/No en-US note/)
  })
})
