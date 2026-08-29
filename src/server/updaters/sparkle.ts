import {
  generateAppcast,
  isSparkleArchive,
  isSparkleMetadataFile,
  parseAppcast,
  parseAppcastMetadata,
  parseSignUpdateSidecar,
} from '~/lib/appcast.ts'
import { ShukkaError } from '~/lib/errors.ts'
import type { ArtifactRef, UpdateAdapter } from './types.ts'

const APPCAST = 'appcast.xml'

function sigName(filename: string): string {
  return `${filename}.sig`
}

function hasSparkleMetadata(filenames: string[]): boolean {
  if (filenames.includes(APPCAST)) return true
  return filenames.some((name) => isSparkleArchive(name) && filenames.includes(sigName(name)))
}

export const sparkleAdapter: UpdateAdapter = {
  kind: 'sparkle',
  isMetadataFile: isSparkleMetadataFile,
  hasRequiredMetadata: hasSparkleMetadata,
  missingMetadataMessage:
    'A Sparkle release needs appcast.xml and/or an updater archive with a matching .sig from sign_update',
  parseMetadata(filename, text) {
    if (filename === APPCAST) return parseAppcastMetadata(text)
    return { version: '', referenced: [] }
  },
  async generateFeedDocument({
    filename,
    origin,
    appSlug,
    channelName,
    releasedAt,
    version,
    artifacts,
    getText,
  }) {
    if (filename && filename !== APPCAST) return null
    const base = `${origin.replace(/\/+$/, '')}/api/update/${appSlug}/${channelName}`

    const uploaded = artifacts.find((file) => file.filename === APPCAST)
    if (uploaded) {
      const items = parseAppcast(await getText(uploaded.s3Key))
      const item = items[0]
      if (!item?.enclosure.filename) {
        throw new ShukkaError('not_found', 'Current release has no Sparkle enclosure')
      }
      const artifact = artifacts.find((file) => file.filename === item.enclosure.filename)
      if (!artifact) {
        throw new ShukkaError('not_found', 'Current release has no Sparkle enclosure')
      }
      const { edSignature, length } = await resolveSignature(item, artifact, artifacts, getText)
      return {
        contentType: 'application/xml; charset=utf-8',
        body: generateAppcast({
          title: item.title || `Version ${version}`,
          version,
          sparkleVersion: item.sparkleVersion || version,
          shortVersionString: item.shortVersionString || version,
          releasedAt,
          enclosureUrl: `${base}/${encodeURIComponent(artifact.filename)}`,
          edSignature,
          length,
          description: item.description || undefined,
          minimumSystemVersion: item.minimumSystemVersion || undefined,
        }),
      }
    }

    const artifact = pickSignedArchive(artifacts)
    if (!artifact) {
      throw new ShukkaError('not_found', 'Current release has no Sparkle updater archive')
    }
    const sigFile = artifacts.find((file) => file.filename === sigName(artifact.filename))
    const sidecar = parseSignUpdateSidecar(sigFile ? await getText(sigFile.s3Key) : '')
    const size = archiveLength(artifact, sidecar.length)

    return {
      contentType: 'application/xml; charset=utf-8',
      body: generateAppcast({
        title: `Version ${version}`,
        version,
        sparkleVersion: version,
        shortVersionString: version,
        releasedAt,
        enclosureUrl: `${base}/${encodeURIComponent(artifact.filename)}`,
        edSignature: sidecar.edSignature,
        length: size,
      }),
    }
  },
  /**
   * Sparkle's feed is one enclosure, not a `platforms` map. Archives still
   * map to `macos` so panel/code that asks the adapter for a target gets a
   * stable answer; metadata and sidecars return null.
   */
  inferFeedTarget(filename) {
    return isSparkleArchive(filename) ? 'macos' : null
  },
  platformsOf(artifacts) {
    const hasMac = artifacts.some(
      (file) => file.filename === APPCAST || isSparkleArchive(file.filename),
    )
    return hasMac ? ['macOS'] : []
  },
}

async function resolveSignature(
  item: ReturnType<typeof parseAppcast>[number],
  artifact: ArtifactRef,
  artifacts: ArtifactRef[],
  getText: (s3Key: string) => Promise<string>,
): Promise<{ edSignature: string; length: string }> {
  let edSignature = item.enclosure.edSignature
  let length = item.enclosure.length
  if (!edSignature || !length) {
    const sigFile = artifacts.find((file) => file.filename === sigName(artifact.filename))
    if (sigFile) {
      const sidecar = parseSignUpdateSidecar(await getText(sigFile.s3Key))
      edSignature ||= sidecar.edSignature
      length ||= sidecar.length
    }
  }
  if (!edSignature) {
    throw new ShukkaError('not_found', 'Current release is missing sparkle:edSignature')
  }
  if (!length) {
    length = archiveLength(artifact, '')
  }
  return { edSignature, length }
}

function archiveLength(artifact: ArtifactRef, declared: string): string {
  if (declared) return declared
  if (typeof artifact.size === 'number' && artifact.size > 0) return String(artifact.size)
  return '0'
}

function pickSignedArchive(artifacts: ArtifactRef[]): ArtifactRef | undefined {
  const archives = artifacts
    .filter((file) => isSparkleArchive(file.filename))
    .sort((a, b) => a.filename.localeCompare(b.filename))
  return archives.find((file) => artifacts.some((entry) => entry.filename === sigName(file.filename)))
}

export function hasSparkleUploadMetadata(filenames: string[]): boolean {
  return hasSparkleMetadata(filenames)
}
