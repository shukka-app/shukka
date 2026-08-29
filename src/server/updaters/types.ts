import type { UpdaterKind } from '~/lib/updater-kind.ts'

export type ArtifactRef = {
  filename: string
  s3Key: string
  kind: 'metadata' | 'artifact'
  size?: number
}

export type MetadataCheck = {
  version: string
  referenced: string[]
}

export type FeedDocument = {
  contentType: string
  body: string
}

export type UpdateAdapter = {
  kind: UpdaterKind
  isMetadataFile(filename: string): boolean
  hasRequiredMetadata(filenames: string[]): boolean
  missingMetadataMessage: string
  parseMetadata(filename: string, text: string): MetadataCheck
  /**
   * When this returns a document, the feed serves it instead of a stored file.
   * `null` means fall through to passthrough metadata or artifact lookup.
   */
  generateFeedDocument?(args: {
    filename: string
    origin: string
    appSlug: string
    channelName: string
    releasedAt: number
    version: string
    artifacts: ArtifactRef[]
    getText: (s3Key: string) => Promise<string>
  }): Promise<FeedDocument | null>
  /**
   * Map an artifact filename to this protocol's feed target key, or `null`
   * when the name does not identify a target. Heuristics only; an uploaded
   * official manifest still supplies declared keys when present.
   */
  inferFeedTarget(filename: string): string | null
  platformsOf(artifacts: { filename: string; kind: string }[]): string[]
}
