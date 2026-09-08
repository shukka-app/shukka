import { mutationOptions, queryOptions, type QueryClient } from '@tanstack/react-query'
import { api } from '~/lib/api.ts'
import type { ReleaseMetadata, ReleaseMetadataResponse } from '~/lib/release-metadata.ts'
import { apiGet } from './apps.ts'
import { metadataKeys } from './keys.ts'

type VersionParams = { slug: string; channel: string; version: string }

function metadataPath({ slug, channel, version }: VersionParams) {
  return `/api/v1/apps/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channel)}/versions/${encodeURIComponent(version)}/metadata`
}

export function versionMetadataQueryOptions({ enabled = true, ...params }: VersionParams & { enabled?: boolean }) {
  return queryOptions({
    queryKey: metadataKeys.version(params.slug, params.channel, params.version),
    queryFn: () => apiGet<ReleaseMetadataResponse>(metadataPath(params)),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

export function replaceMetadataMutationOptions({ queryClient, ...params }: VersionParams & { queryClient: QueryClient }) {
  return mutationOptions({
    mutationFn: (metadata: ReleaseMetadata) => api.put<ReleaseMetadataResponse>(metadataPath(params), { metadata }),
    onSuccess: (data) => {
      queryClient.setQueryData(metadataKeys.version(params.slug, params.channel, params.version), data)
    },
  })
}
