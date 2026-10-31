import { ShukkaError } from '~/lib/errors.ts'
import { store } from '~/lib/store.ts'
import { getAppBySlug } from './apps.ts'
import { getChannel } from './channels.ts'
import { feedBaseUrl } from './feed.ts'

/**
 * Format-neutral release manifest for clients that are not an updater: the
 * current released version plus the artifacts it carries. Updater documents
 * stay on `/api/update/...` (ADR: channel-release-endpoint). Files are 302
 * links into the feed, so downloads share its redirect and hit rules.
 */
export async function channelRelease(appSlug: string, channelName: string, origin: string) {
  const app = await getAppBySlug(appSlug)
  const channel = await getChannel(app.id, channelName)

  if (!channel.currentVersionId) {
    throw new ShukkaError('not_found', `Channel "${channelName}" has no published version`)
  }

  const current = await store.getVersionById(channel.currentVersionId)
  if (!current?.releasedAt) {
    throw new ShukkaError('not_found', `Channel "${channelName}" has no published version`)
  }

  const artifacts = await store.listArtifacts(current.id)
  const base = feedBaseUrl(origin, appSlug, channelName)

  return {
    version: current.version,
    releasedAt: current.releasedAt,
    files: artifacts
      .filter((artifact) => artifact.kind === 'artifact')
      .map((artifact) => ({
        filename: artifact.filename,
        size: artifact.size,
        url: `${base}/${encodeURIComponent(artifact.filename)}`,
      })),
  }
}
