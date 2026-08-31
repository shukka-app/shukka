import { db } from '~/db/index.ts'
import { apps } from '~/db/schema.ts'
import { getApp, getAppBySlug, listApiKeys } from './apps.ts'
import { listChannelsForApps, listVersionsForChannels } from './channels.ts'
import { feedBaseUrl } from './feed.ts'
import { notesConfig } from './release-notes.ts'
import { listArtifactsForVersions } from './releases.ts'
import type { App } from '~/db/schema.ts'

/** Storage settings without the secret, safe to send to the panel. */
export function publicApp(app: App) {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    s3Endpoint: app.s3Endpoint,
    s3Region: app.s3Region,
    s3Bucket: app.s3Bucket,
    s3Prefix: app.s3Prefix,
    s3AccessKeyId: app.s3AccessKeyId,
    s3ForcePathStyle: app.s3ForcePathStyle,
    releaseLogEnabled: app.releaseLogEnabled,
    releaseLogLocales: notesConfig(app).locales,
    releaseLogFallbackLocale: app.releaseLogFallbackLocale,
    updaterKind: app.updaterKind,
    createdAt: app.createdAt,
  }
}

export type PublicApp = ReturnType<typeof publicApp>

export async function appSummaries() {
  const allApps = await db.select().from(apps).orderBy(apps.name)
  const allChannels = await listChannelsForApps(allApps.map((app) => app.id))
  const allVersions = await listVersionsForChannels(allChannels.map((channel) => channel.id))

  return allApps.map((app) => {
    const appChannelRows = allChannels.filter((channel) => channel.appId === app.id)
    const channelVersions = appChannelRows.map((channel) => ({
      channel,
      versions: allVersions.filter((version) => version.channelId === channel.id),
    }))
    const appVersions = channelVersions.flatMap((entry) => entry.versions)

    const channelRows = channelVersions.map(({ channel, versions }) => ({
      id: channel.id,
      name: channel.name,
      currentVersion: versions.find((version) => version.id === channel.currentVersionId)?.version ?? null,
    }))

    return {
      ...publicApp(app),
      channels: channelRows,
      totalDownloads: appVersions.reduce((sum, version) => sum + version.artifactHits, 0),
      lastReleasedAt: (() => {
        const published = appVersions.map((version) => version.releasedAt).filter((at): at is number => at != null)
        return published.length > 0 ? Math.max(...published) : null
      })(),
    }
  })
}

export type AppSummary = Awaited<ReturnType<typeof appSummaries>>[number]

export async function appDetailBySlug(slug: string, origin: string, options?: { includeKeys?: boolean }) {
  return appDetail((await getAppBySlug(slug)).id, origin, options)
}

async function appChannels(app: App, origin: string) {
  const channelRows = await listChannelsForApps([app.id])
  const versionRows = await listVersionsForChannels(channelRows.map((channel) => channel.id))
  const artifactRows = await listArtifactsForVersions(versionRows.map((version) => version.id))

  return channelRows.map((channel) => {
    const versionDetails = versionRows
      .filter((version) => version.channelId === channel.id)
      .map((version) => ({
        ...version,
        isDraft: version.releasedAt == null,
        isCurrent: version.id === channel.currentVersionId,
        artifacts: artifactRows.filter((artifact) => artifact.versionId === version.id),
      }))
    return {
      id: channel.id,
      name: channel.name,
      currentVersionId: channel.currentVersionId,
      feedUrl: feedBaseUrl(origin, app.slug, channel.name),
      versions: versionDetails,
    }
  })
}

async function publicApiKeys(appId: number) {
  return (await listApiKeys(appId)).map((key) => ({
    id: key.id,
    name: key.name,
    hint: key.hint,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    revokedAt: key.revokedAt,
  }))
}

export async function appDetail(appId: number, origin: string, options?: { includeKeys?: boolean }) {
  const app = await getApp(appId)
  const channelDetails = await appChannels(app, origin)
  if (options?.includeKeys === false) {
    return { app: publicApp(app), channels: channelDetails }
  }
  return { app: publicApp(app), channels: channelDetails, keys: await publicApiKeys(app.id) }
}

export type AppDetail = {
  app: PublicApp
  channels: Awaited<ReturnType<typeof appChannels>>
  keys: Awaited<ReturnType<typeof publicApiKeys>>
}
export type ChannelDetail = AppDetail['channels'][number]
export type VersionDetail = ChannelDetail['versions'][number]
