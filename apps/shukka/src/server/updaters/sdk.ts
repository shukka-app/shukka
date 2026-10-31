import type { UpdateAdapter } from './types.ts'

/**
 * Free-form: an app that ships its own update logic and reads the public
 * release manifest (`/api/v1/apps/{appSlug}/channels/{channel}/release`)
 * through an SDK instead of an updater protocol.
 *
 * Nothing is interpreted by filename — no metadata document is parsed, the
 * feed serves every file by name (302 to storage), and the version comes from
 * the uploader because nothing declares it.
 */
export const sdkAdapter: UpdateAdapter = {
  kind: 'sdk',
  isMetadataFile() {
    return false
  },
  hasRequiredMetadata() {
    // No metadata contract: `initUpload` already rejects an empty file list.
    return true
  },
  missingMetadataMessage: 'An SDK release needs at least one file',
  parseMetadata() {
    return { version: '', referenced: [] }
  },
  inferFeedTarget() {
    return null
  },
  platformsOf(artifacts) {
    const found = new Set<string>()
    for (const artifact of artifacts) {
      if (artifact.kind !== 'artifact') continue
      const name = artifact.filename.toLowerCase()
      if (/\.(dmg|pkg)$/.test(name)) found.add('macOS')
      else if (/\.(exe|msi)$/.test(name)) found.add('Windows')
      else if (/\.(appimage|deb|rpm)$/.test(name)) found.add('Linux')
    }
    return ['macOS', 'Windows', 'Linux'].filter((platform) => found.has(platform))
  },
}
