import type { App, Channel, Version } from '@shukka/store'
import { ShukkaError } from '~/lib/errors.ts'
import { clearObjectCache } from '~/lib/object-cache.ts'
import { store } from '~/lib/store.ts'
import { deleteObjects, settingsFromApp } from '~/lib/storage.ts'

const CHANNEL_PATTERN = /^[a-z0-9][a-z0-9_-]{0,62}$/

export function assertChannelName(name: string): void {
  if (!CHANNEL_PATTERN.test(name)) {
    throw new ShukkaError('invalid_request', 'Channel name must be lowercase letters, digits, dash or underscore')
  }
}

export async function listChannels(appId: number) {
  return store.listChannels(appId)
}

export async function listChannelsForApps(appIds: number[]): Promise<Channel[]> {
  return store.listChannelsForApps(appIds)
}

export async function getChannel(appId: number, name: string): Promise<Channel> {
  const channel = await store.getChannel(appId, name)
  if (!channel) throw new ShukkaError('not_found', `Channel "${name}" not found`)
  return channel
}

export async function createChannel(appId: number, name: string): Promise<Channel> {
  assertChannelName(name)
  if (await store.getChannel(appId, name)) {
    throw new ShukkaError('conflict', `Channel "${name}" already exists`)
  }
  const result = await store.createChannel(appId, name)
  if (!result.ok) throw new ShukkaError('conflict', `Channel "${name}" already exists`)
  return result.value
}

/** Removes the channel, its version records, and every object those versions own. */
export async function deleteChannel(app: App, channelId: number): Promise<void> {
  const keys = await store.listArtifactS3KeysForChannel(channelId)
  if (keys.length > 0) await deleteObjects(settingsFromApp(app), keys)
  await store.deleteChannel(channelId)
  clearObjectCache()
}

export async function deleteChannelByName(app: App, name: string): Promise<void> {
  await deleteChannel(app, (await getChannel(app.id, name)).id)
}

export async function listVersions(channelId: number) {
  return store.listVersions(channelId)
}

export async function listVersionsForChannels(channelIds: number[]) {
  return store.listVersionsForChannels(channelIds)
}

/** Published versions only, newest `releasedAt` first — public notes and feed fallbacks. */
export async function listPublishedVersions(channelId: number) {
  return store.listPublishedVersions(channelId)
}

export async function getVersion(appId: number, channelName: string, version: string): Promise<Version> {
  const channel = await getChannel(appId, channelName)
  const row = await store.getVersion(channel.id, version)
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
    await store.setCurrentVersionId(channel.id, null)
    return
  }

  const row = await getVersion(appId, channelName, version)
  await store.promote(channel.id, row.id, Math.floor(Date.now() / 1000))
}
