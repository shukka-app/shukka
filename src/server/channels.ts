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

export function listChannels(appId: number): Channel[] {
  // Creation order keeps the default channel first.
  return db.select().from(channels).where(eq(channels.appId, appId)).orderBy(channels.createdAt, channels.id).all()
}

export function listChannelsForApps(appIds: number[]): Channel[] {
  if (appIds.length === 0) return []
  return db
    .select()
    .from(channels)
    .where(inArray(channels.appId, appIds))
    .orderBy(channels.createdAt, channels.id)
    .all()
}

export function getChannel(appId: number, name: string): Channel {
  const channel = db
    .select()
    .from(channels)
    .where(and(eq(channels.appId, appId), eq(channels.name, name)))
    .get()
  if (!channel) throw new ShukkaError('not_found', `Channel "${name}" not found`)
  return channel
}

export function createChannel(appId: number, name: string): Channel {
  assertChannelName(name)
  const existing = db
    .select()
    .from(channels)
    .where(and(eq(channels.appId, appId), eq(channels.name, name)))
    .get()
  if (existing) throw new ShukkaError('conflict', `Channel "${name}" already exists`)
  return db.insert(channels).values({ appId, name }).returning().get()
}

/** Removes the channel, its version records, and every object those versions own. */
export async function deleteChannel(app: App, channelId: number): Promise<void> {

  const keys = db
    .select({ s3Key: artifacts.s3Key })
    .from(artifacts)
    .innerJoin(versions, eq(artifacts.versionId, versions.id))
    .where(eq(versions.channelId, channelId))
    .all()
    .map((row) => row.s3Key)

  if (keys.length > 0) await deleteObjects(settingsFromApp(app), keys)
  db.delete(channels).where(eq(channels.id, channelId)).run()
  clearObjectCache()
}

export async function deleteChannelByName(app: App, name: string): Promise<void> {
  await deleteChannel(app, getChannel(app.id, name).id)
}

export function listVersions(channelId: number) {
  return db
    .select()
    .from(versions)
    .where(eq(versions.channelId, channelId))
    .orderBy(desc(versions.createdAt), desc(versions.id))
    .all()
}

export function listVersionsForChannels(channelIds: number[]) {
  if (channelIds.length === 0) return []
  return db
    .select()
    .from(versions)
    .where(inArray(versions.channelId, channelIds))
    .orderBy(desc(versions.createdAt), desc(versions.id))
    .all()
}

/** Published versions only, newest `releasedAt` first — public notes and feed fallbacks. */
export function listPublishedVersions(channelId: number) {
  return db
    .select()
    .from(versions)
    .where(and(eq(versions.channelId, channelId), isNotNull(versions.releasedAt)))
    .orderBy(desc(versions.releasedAt), desc(versions.id))
    .all()
}

export function getVersion(appId: number, channelName: string, version: string): Version {
  const channel = getChannel(appId, channelName)
  const row = db
    .select()
    .from(versions)
    .where(and(eq(versions.channelId, channel.id), eq(versions.version, version)))
    .get()
  if (!row) throw new ShukkaError('not_found', `Version "${version}" not found`)
  return row
}

/**
 * Points the channel at a version string (or clears current). A draft is
 * released in the same transaction: `releasedAt` is written, then the pointer.
 */
export function setCurrentVersion(appId: number, channelName: string, version: string | null): void {
  const channel = getChannel(appId, channelName)
  if (version === null) {
    db.update(channels).set({ currentVersionId: null }).where(eq(channels.id, channel.id)).run()
    return
  }

  const row = getVersion(appId, channelName, version)
  const now = Math.floor(Date.now() / 1000)
  db.transaction((tx) => {
    if (row.releasedAt == null) {
      tx.update(versions).set({ releasedAt: now }).where(eq(versions.id, row.id)).run()
    }
    tx.update(channels).set({ currentVersionId: row.id }).where(eq(channels.id, channel.id)).run()
  })
}
