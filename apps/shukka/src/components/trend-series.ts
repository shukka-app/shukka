export type TrendSeries = {
  key: 'metadata' | 'artifact'
  label: string
  tone: 'flare' | 'ink'
}

/** Every hit-trend chart plots the same two series; callers supply localized labels. */
export function hitTrendSeries(labels: { downloads: string; updateChecks: string }): TrendSeries[] {
  return [
    { key: 'artifact', label: labels.downloads, tone: 'flare' },
    { key: 'metadata', label: labels.updateChecks, tone: 'ink' },
  ]
}
