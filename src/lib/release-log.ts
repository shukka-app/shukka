/**
 * Shared release-log contract (ADR: release-log): types, constants and the
 * pure resolution functions. No db/react imports — the panel value-imports
 * from here, so this module must stay free of server-only dependencies.
 */
import { ShukkaError } from './errors.ts'

export const DEFAULT_FALLBACK_LOCALE = 'en-US'

/** An empty `from` selects this many latest versions that carry a note. */
export const LATEST_NOTES_LIMIT = 10

/** One stored note's content, keyed by locale. */
export type NoteContent = {
  locale: string
  markdown: string
  html: string
  text: string
}

/** Public response entry: a version plus its note resolved to a single locale. */
export type VersionNote = NoteContent & {
  version: string
  releasedAt: number
}

export type ReleaseNotesResponse = { notes: VersionNote[] }

/** App-level release log configuration. */
export type NotesConfig = {
  enabled: boolean
  locales: string[]
  fallbackLocale: string
}

/** Matches the DB column defaults — an untouched app needs no config write. */
export const DEFAULT_NOTES_CONFIG: NotesConfig = {
  enabled: false,
  locales: [],
  fallbackLocale: DEFAULT_FALLBACK_LOCALE,
}

/** Structural BCP-47 check; Intl rejects malformed tags. */
export function isValidLocale(locale: string): boolean {
  try {
    return Intl.getCanonicalLocales(locale).length === 1
  } catch {
    return false
  }
}

/** BCP-47 canonical form ('en-us' → 'en-US'); throws ShukkaError on malformed tags. */
export function canonicalLocale(locale: string): string {
  try {
    const [canonical] = Intl.getCanonicalLocales(locale)
    if (!canonical) throw new Error('empty')
    return canonical
  } catch {
    throw new ShukkaError('invalid_request', `Invalid locale tag: "${locale}"`)
  }
}

/**
 * Locale fallback chain: canonical match on the requested locale, then the app's
 * fallback locale, then the first available locale (callers pass notes sorted
 * by locale so "first" is deterministic). Comparisons use BCP-47 canonical form
 * so case variants match; a malformed stored tag is compared as-is so the public
 * endpoint never throws. Null means the chain is exhausted and the version is
 * omitted from the response.
 */
export function resolveNoteLocale(
  notes: NoteContent[],
  requested: string | null,
  fallbackLocale: string,
): NoteContent | null {
  const canon = (tag: string): string => {
    try {
      return Intl.getCanonicalLocales(tag)[0] ?? tag
    } catch {
      return tag
    }
  }
  if (requested) {
    const exact = notes.find((note) => canon(note.locale) === canon(requested))
    if (exact) return exact
  }
  return notes.find((note) => canon(note.locale) === canon(fallbackLocale)) ?? notes[0] ?? null
}

/**
 * Version-range resolution over a channel's release timeline. `versions` is
 * the channel's versions newest-first; the result stays newest-first, holds
 * `from` inclusively and `to` exclusively. Unknown bounds are loud — a typo'd
 * version silently returning a shifted range would be worse.
 */
export function resolveNotesRange<T extends { version: string }>(
  versions: T[],
  from: string,
  to: string | null,
): T[] {
  const fromIndex = versions.findIndex((version) => version.version === from)
  if (fromIndex === -1) throw new ShukkaError('invalid_request', `Version "${from}" not found on this channel`)
  let toIndex = -1
  if (to !== null) {
    toIndex = versions.findIndex((version) => version.version === to)
    if (toIndex === -1) throw new ShukkaError('invalid_request', `Version "${to}" not found on this channel`)
  }
  return versions.slice(toIndex + 1, fromIndex + 1)
}
