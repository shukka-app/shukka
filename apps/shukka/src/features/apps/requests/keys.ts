export const appKeys = {
  all: () => ['apps'] as const,
  list: () => [...appKeys.all(), 'list'] as const,
  detail: (slug: string) => [...appKeys.all(), 'detail', slug] as const,
}

export const metadataKeys = {
  all: () => ['release-metadata'] as const,
  version: (slug: string, channel: string, version: string) =>
    [...metadataKeys.all(), slug, channel, version] as const,
}
