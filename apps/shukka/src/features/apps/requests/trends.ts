import { queryOptions } from '@tanstack/react-query'
import type { ChannelTrend, TrendRange, VersionTrend } from '~/lib/trends.ts'
import { apiGet } from './apps.ts'

/**
 * Trend queries are never SSR-primed (the chart sits behind a lazy boundary)
 * and no mutation invalidates them — buckets only grow, so a 30s staleTime is
 * the only freshness knob (ADR: hit-trends).
 */
export const trendKeys = {
  all: () => ['trends'] as const,
  channel: (slug: string, channel: string, range: TrendRange) =>
    [...trendKeys.all(), 'channel', slug, channel, range] as const,
  version: (slug: string, channel: string, version: string) =>
    [...trendKeys.all(), 'version', slug, channel, version] as const,
}

export function channelTrendQueryOptions({
  slug,
  channel,
  range,
}: {
  slug: string
  channel: string
  range: TrendRange
}) {
  return queryOptions({
    queryKey: trendKeys.channel(slug, channel, range),
    queryFn: () =>
      apiGet<ChannelTrend>(
        `/api/v1/apps/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channel)}/trend?range=${range}`,
      ),
    staleTime: 30_000,
  })
}

export function versionTrendQueryOptions({
  slug,
  channel,
  version,
}: {
  slug: string
  channel: string
  version: string
}) {
  return queryOptions({
    queryKey: trendKeys.version(slug, channel, version),
    queryFn: () =>
      apiGet<VersionTrend>(
        `/api/v1/apps/${encodeURIComponent(slug)}/channels/${encodeURIComponent(channel)}/versions/${encodeURIComponent(version)}/trend`,
      ),
    staleTime: 30_000,
  })
}
