import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '~/db/index.ts'
import { apps, releaseNotes, versions } from '~/db/schema.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { renderMarkdown } from '~/lib/markdown.ts'
import {
  LATEST_NOTES_LIMIT,
  canonicalLocale,
  resolveNoteLocale,
  resolveNotesRange,
  type NoteContent,
  type NotesConfig,
  type ReleaseNotesResponse,
  type VersionNote,
} from '~/lib/release-log.ts'
import { getApp, getAppBySlug } from './apps.ts'
import { getChannel, listPublishedVersions } from './channels.ts'
import type { App, Version } from '~/db/schema.ts'

/** Parses the stored config columns into the shared shape. */
export function notesConfig(app: App): NotesConfig {
  let locales: string[] = []
  try {
    const parsed: unknown = JSON.parse(app.releaseLogLocales)
    if (Array.isArray(parsed)) locales = parsed.filter((entry): entry is string => typeof entry === 'string')
  } catch {
    locales = []
  }
  return { enabled: app.releaseLogEnabled, locales, fallbackLocale: app.releaseLogFallbackLocale }
}

/**
 * Saves the release log config. Deliberately separate from updateApp so this
 * path never triggers the S3 storage probe (ADR: release-log).
 */
export async function updateNotesConfig(appId: number, input: NotesConfig): Promise<NotesConfig> {
  await getApp(appId)
  const locales = [...new Set(input.locales.map((locale) => canonicalLocale(locale)))]
  const fallbackLocale = canonicalLocale(input.fallbackLocale)
  if (input.enabled && locales.length === 0) {
    throw new ShukkaError('invalid_request', 'At least one locale is required when the release log is enabled')
  }
  if (input.enabled && !locales.includes(fallbackLocale)) {
    throw new ShukkaError('invalid_request', 'The fallback locale must be one of the configured locales')
  }

  await db
    .update(apps)
    .set({
      releaseLogEnabled: input.enabled,
      releaseLogLocales: JSON.stringify(locales),
      releaseLogFallbackLocale: fallbackLocale,
    })
    .where(eq(apps.id, appId))
  return { enabled: input.enabled, locales, fallbackLocale }
}

async function getVersionForApp(appId: number, versionId: number): Promise<Version> {
  const [version] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.appId, appId)))
    .limit(1)
  if (!version) throw new ShukkaError('not_found', 'Version not found')
  return version
}

/** Notes are writable only while the app has the release log enabled. */
function assertNotesEnabled(app: App): void {
  if (!app.releaseLogEnabled) {
    throw new ShukkaError('invalid_request', 'Release log is not enabled for this app')
  }
}

/** All locales' notes for a version, sorted by locale for a deterministic fallback chain. */
export async function listNotes(appId: number, versionId: number): Promise<NoteContent[]> {
  await getVersionForApp(appId, versionId)
  return db
    .select()
    .from(releaseNotes)
    .where(eq(releaseNotes.versionId, versionId))
    .orderBy(asc(releaseNotes.locale))
}

/** Upsert: re-saving a locale re-renders html/text with the current pipeline. */
export async function upsertNote(appId: number, versionId: number, locale: string, markdown: string): Promise<NoteContent> {
  const app = await getApp(appId)
  assertNotesEnabled(app)
  locale = canonicalLocale(locale)
  await getVersionForApp(appId, versionId)
  if (!markdown.trim()) throw new ShukkaError('invalid_request', 'Note markdown must not be empty')

  const { html, text } = renderMarkdown(markdown)
  const [note] = await db
    .insert(releaseNotes)
    .values({ versionId, locale, markdown, html, text })
    .onConflictDoUpdate({
      target: [releaseNotes.versionId, releaseNotes.locale],
      set: { markdown, html, text },
    })
    .returning()
  return note
}

export async function deleteNote(appId: number, versionId: number, locale: string): Promise<void> {
  const app = await getApp(appId)
  assertNotesEnabled(app)
  await getVersionForApp(appId, versionId)
  locale = canonicalLocale(locale)
  const [deleted] = await db
    .delete(releaseNotes)
    .where(and(eq(releaseNotes.versionId, versionId), eq(releaseNotes.locale, locale)))
    .returning()
  if (!deleted) throw new ShukkaError('not_found', `No ${locale} note on this version`)
}

export type NotesQuery = { from: string | null; to: string | null; locale: string | null }

/**
 * Public, unauthenticated read (same trust model as the update feed). Pure
 * SELECTs: html/text were rendered at write time. Apps without the release
 * log enabled return no data; versions whose fallback chain is exhausted are
 * omitted from the response.
 */
export async function publicNotes(appSlug: string, channelName: string, query: NotesQuery): Promise<ReleaseNotesResponse> {
  const app = await getAppBySlug(appSlug)
  const channel = await getChannel(app.id, channelName)
  if (!app.releaseLogEnabled) return { notes: [] }

  const channelVersions = await listPublishedVersions(channel.id)
  let selected: Version[]
  if (query.from !== null) {
    selected = resolveNotesRange(channelVersions, query.from, query.to)
  } else {
    const noted = await db
      .selectDistinct({ versionId: releaseNotes.versionId })
      .from(releaseNotes)
      .innerJoin(versions, eq(releaseNotes.versionId, versions.id))
      .where(eq(versions.channelId, channel.id))
    const notedIds = new Set(noted.map((row) => row.versionId))
    selected = channelVersions.filter((version) => notedIds.has(version.id)).slice(0, LATEST_NOTES_LIMIT)
  }
  if (selected.length === 0) return { notes: [] }

  const noteRows = await db
    .select()
    .from(releaseNotes)
    .where(inArray(releaseNotes.versionId, selected.map((version) => version.id)))
    .orderBy(asc(releaseNotes.locale))

  const byVersion = new Map<number, NoteContent[]>()
  for (const row of noteRows) {
    const list = byVersion.get(row.versionId) ?? []
    list.push(row)
    byVersion.set(row.versionId, list)
  }

  const config = notesConfig(app)
  const notes: VersionNote[] = []
  for (const version of selected) {
    const resolved = resolveNoteLocale(byVersion.get(version.id) ?? [], query.locale, config.fallbackLocale)
    if (resolved && version.releasedAt != null) {
      notes.push({ version: version.version, releasedAt: version.releasedAt, ...resolved })
    }
  }
  return { notes }
}
