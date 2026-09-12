import { ShukkaError } from '~/lib/errors.ts'
import { store } from '~/lib/store.ts'
import type { ReleaseMetadata, ReleaseMetadataResponse } from '~/lib/release-metadata.ts'
import { getVersion } from './channels.ts'

export async function getReleaseMetadata(
  appId: number, channel: string, versionName: string, authenticated: boolean,
): Promise<ReleaseMetadataResponse> {
  const version = await getVersion(appId, channel, versionName)
  if (!authenticated && version.releasedAt === null) {
    throw new ShukkaError('not_found', 'Version not found')
  }
  return { version: version.version, metadata: version.metadata }
}

export async function replaceReleaseMetadata(
  appId: number, channel: string, versionName: string, metadata: ReleaseMetadata,
): Promise<ReleaseMetadataResponse> {
  const version = await getVersion(appId, channel, versionName)
  const saved = await store.updateVersionMetadata(version.id, metadata)
  if (!saved) throw new ShukkaError('not_found', 'Version not found')
  return { version: saved.version, metadata: saved.metadata }
}
