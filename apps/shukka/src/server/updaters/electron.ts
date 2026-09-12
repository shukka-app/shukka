import { isMetadataFile, parseUpdateMetadata, referencedArtifacts } from '~/lib/update-metadata.ts'
import type { UpdateAdapter } from './types.ts'

export const electronAdapter: UpdateAdapter = {
  kind: 'electron',
  isMetadataFile,
  hasRequiredMetadata(filenames) {
    return filenames.some(isMetadataFile)
  },
  missingMetadataMessage: 'At least one electron-updater .yml metadata file is required',
  parseMetadata(filename, text) {
    const metadata = parseUpdateMetadata(filename, text)
    return { version: metadata.version, referenced: referencedArtifacts(metadata) }
  },
  inferFeedTarget() {
    return null
  },
  platformsOf(artifacts) {
    const found = new Set<string>()
    for (const artifact of artifacts) {
      if (artifact.kind !== 'metadata') continue
      const name = artifact.filename.toLowerCase()
      if (name.includes('-mac')) found.add('macOS')
      else if (name.includes('-linux')) found.add('Linux')
      else if (/\.ya?ml$/i.test(name)) found.add('Windows')
    }
    return ['macOS', 'Windows', 'Linux'].filter((platform) => found.has(platform))
  },
}
