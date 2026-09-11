import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '~/db/index.ts'
import { artifacts, channels, versions } from '~/db/schema.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { clearObjectCache } from '~/lib/object-cache.ts'
import { deleteObjects, settingsFromApp } from '~/lib/storage.ts'
import type { App, Channel, Version } from '~/db/schema.ts'

const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/

export function assertChannelName(name: string): void {
  if (!CHANNEL_PATTERN.test(name)) {
    throw new ShukkaError('invalid_request', 'Channel name must be lowercase letters, digits, dash or underscore')
  }
}

export async function listChannels(appId: number) {
  // Creation order keeps the default channel first.
  return db.select().from(channels).where(eq(channels.appId, appId)).orderBy(channels.createdAt, channels.id)
}

export async function listChannelsForApps(appIds: number[]): Promise<Channel[]> {
  if (appIds.length === 0) return []
  return db
    .select()
    .from(channels)
    .where(inArray(channels.appId, appIds))
    .orderBy(channels.createdAt, channels.id)
}

export async function getChannel(appId: number, name: string): Promise<Channel> {
  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.appId, appId), eq(channels.name, name)))
    .limit(1)
  if (!channel) throw new ShukkaError('not_found', `Channel "${name}" not found`)
  return channel
}

export async function createChannel(appId: number, name: string): Promise<Channel> {
  assertChannelName(name)
  const [existing] = await db
    .select({ id: channels.id })
    .from(channels)
    .where(and(eq(channels.appId, appId), eq(channels.name, name)))
    .limit(1)
  if (existing) throw new ShukkaError('conflict', `Channel "${name}" already exists`)
  const [created] = await db.insert(channels).values({ appId, name }).returning()
  return created
}

/** Removes the channel, its version records, and every object those versions own. */
export async function deleteChannel(app: App, channelId: number): Promise<void> {
  const keys = (
    await db
      .select({ s3Key: artifacts.s3Key })
      .from(artifacts)
      .innerJoin(versions, eq(artifacts.versionId, versions.id))
      .where(eq(versions.channelId, channelId))
  ).map((row) => row.s3Key)

  if (keys.length > 0) await deleteObjects(settingsFromApp(app), keys)
  await db.delete(channels).where(eq(channels.id, channelId))
  clearObjectCache()
}

export async function deleteChannelByName(app: App, name: string): Promise<void> {
  await deleteChannel(app, (await getChannel(app.id, name)).id)
}

export async function listVersions(channelId: number) {
  return db
    .select()
    .from(versions)
    .where(eq(versions.channelId, channelId))
    .orderBy(desc(versions.createdAt), desc(versions.id))
}

export async function listVersionsForChannels(channelIds: number[]) {
  if (channelIds.length === 0) return []
  return db
    .select()
    .from(versions)
    .where(inArray(versions.channelId, channelIds))
    .orderBy(desc(versions.createdAt), desc(versions.id))
}

/** Published versions only, newest `releasedAt` first — public notes and feed fallbacks. */
export async function listPublishedVersions(channelId: number) {
  return db
    .select()
    .from(versions)
    .where(and(eq(versions.channelId, channelId), isNotNull(versions.releasedAt)))
    .orderBy(desc(versions.releasedAt), desc(versions.id))
}

export async function getVersion(appId: number, channelName: string, version: string): Promise<Version> {
  const channel = await getChannel(appId, channelName)
  const [row] = await db
    .select()
    .from(versions)
    .where(and(eq(versions.channelId, channel.id), eq(versions.version, version)))
    .limit(1)
  if (!row) throw new ShukkaError('not_found', `Version "${version}" not found`)
  return row
}

/**
 * Points the channel at a version string (or clears current). A draft is
 * released in the same transaction: `releasedAt` is written, then the pointer.
 */
export async function setCurrentVersion(appId: number, channelName: string, version: string | null): Promise<void> {
  const channel = await getChannel(appId, channelName)
  if (version === null) {
    await db.update(channels).set({ currentVersionId: null }).where(eq(channels.id, channel.id))
    return
  }

  const row = await getVersion(appId, channelName, version)
  const now = Math.floor(Date.now() / 1000)
  await db.transaction(async (tx) => {
    if (row.releasedAt == null) {
      await tx.update(versions).set({ releasedAt: now }).where(eq(versions.id, row.id))
    }
    await tx.update(channels).set({ currentVersionId: row.id }).where(eq(channels.id, channel.id))
  })
}
