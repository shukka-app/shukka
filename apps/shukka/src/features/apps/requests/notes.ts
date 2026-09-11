import { mutationOptions, queryOptions } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { api } from '~/lib/api.ts'
import type { NoteContent, NotesConfig } from '~/lib/release-log.ts'
import { apiGet } from './apps.ts'
import { appKeys } from './keys.ts'

export const noteKeys = {
  all: () => ['release-notes'] as const,
  version: (slug: string, channel: string, version: string) =>
    [...noteKeys.all(), 'version', slug, channel, version] as const,
}

export type NotesConfigVariables = { slug: string } & NotesConfig
export type UpsertNoteVariables = { channel: string; version: string; locale: string; markdown: string }
export type DeleteNoteVariables = { channel: string; version: string; locale: string }

type MutationParams<TData, TVariables> = {
  queryClient: QueryClient
  onSuccess?: (data: TData, variables: TVariables) => void
}

function notesPath(slug: string, channel: string, version: string, locale?: string) {
  const base = `/api/v1/apps/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channel)}/versions/${encodeURIComponent(version)}/notes`
  return locale ? `${base}/${encodeURIComponent(locale)}` : base
}

/** The notes page's read model; fetched when the editor opens. */
export function versionNotesQueryOptions({
  slug,
  channel,
  version,
}: {
  slug: string
  channel: string
  version: string
}) {
  return queryOptions({
    queryKey: noteKeys.version(slug, channel, version),
    queryFn: () => apiGet<{ notes: NoteContent[] }>(notesPath(slug, channel, version)).then((data) => data.notes),
    staleTime: 30_000,
  })
}

/** Dedicated config endpoint — deliberately not the app PATCH, so no storage probe fires. */
export function updateNotesConfigMutationOptions({
  queryClient,
  onSuccess,
}: MutationParams<{ releaseLog: NotesConfig }, NotesConfigVariables>) {
  return mutationOptions({
    mutationFn: ({ slug, ...values }: NotesConfigVariables) =>
      api.put<{ releaseLog: NotesConfig }>(`/api/v1/apps/${encodeURIComponent(slug)}/notes-config`, values),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: appKeys.detail(variables.slug) })
      onSuccess?.(data, variables)
    },
  })
}

export function upsertNoteMutationOptions({
  slug,
  queryClient,
  onSuccess,
}: MutationParams<{ note: NoteContent }, UpsertNoteVariables> & { slug: string }) {
  return mutationOptions({
    mutationFn: ({ channel, version, locale, markdown }: UpsertNoteVariables) =>
      api.put<{ note: NoteContent }>(notesPath(slug, channel, version, locale), { markdown }),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: noteKeys.version(slug, variables.channel, variables.version) })
      onSuccess?.(data, variables)
    },
  })
}

export function deleteNoteMutationOptions({
  slug,
  queryClient,
  onSuccess,
}: MutationParams<unknown, DeleteNoteVariables> & { slug: string }) {
  return mutationOptions({
    mutationFn: ({ channel, version, locale }: DeleteNoteVariables) =>
      api.delete(notesPath(slug, channel, version, locale)),
    onSuccess: async (data, variables) => {
      await queryClient.invalidateQueries({ queryKey: noteKeys.version(slug, variables.channel, variables.version) })
      onSuccess?.(data, variables)
    },
  })
}
