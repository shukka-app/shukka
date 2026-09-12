export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: 'conflict' }

export type UpdaterKind = 'electron' | 'tauri' | 'sparkle'
export type ArtifactKind = 'metadata' | 'artifact'
export type HitKind = 'metadata' | 'artifact'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

export type Admin = {
  id: number
  passwordHash: string
  createdAt: number
  updatedAt: number
}

export type Session = {
  tokenHash: string
  createdAt: number
  expiresAt: number
}

export type App = {
  id: number
  slug: string
  name: string
  s3Endpoint: string | null
  s3Region: string
  s3Bucket: string
  s3Prefix: string
  s3AccessKeyId: string
  s3SecretEncrypted: string
  s3ForcePathStyle: boolean
  releaseLogEnabled: boolean
  releaseLogLocales: string
  releaseLogFallbackLocale: string
  updaterKind: UpdaterKind
  createdAt: number
}

export type Channel = {
  id: number
  appId: number
  name: string
  currentVersionId: number | null
  createdAt: number
}

export type Version = {
  id: number
  appId: number
  channelId: number
  version: string
  createdAt: number
  releasedAt: number | null
  metadata: JsonObject
  metadataHits: number
  artifactHits: number
}

export type HitBucket = {
  id: number
  versionId: number
  kind: HitKind
  hourStart: number
  count: number
}

export type ReleaseNote = {
  id: number
  versionId: number
  locale: string
  markdown: string
  html: string
  text: string
}

export type Artifact = {
  id: number
  versionId: number
  filename: string
  s3Key: string
  size: number
  kind: ArtifactKind
}

export type ApiKey = {
  id: number
  appId: number
  name: string
  hash: string
  hint: string
  createdAt: number
  lastUsedAt: number | null
  revokedAt: number | null
}

export type PendingFile = { filename: string; s3Key: string; size: number }

export type PendingUpload = {
  id: string
  appId: number
  channelId: number
  version: string
  files: PendingFile[]
  createdAt: number
  expiresAt: number
}

export type HitBucketRow = { bucket: number; kind: HitKind; count: number }

export type CreateAppInput = {
  name: string
  slug: string
  s3Endpoint: string | null
  s3Region: string
  s3Bucket: string
  s3Prefix: string
  s3AccessKeyId: string
  s3SecretEncrypted: string
  s3ForcePathStyle: boolean
  updaterKind: UpdaterKind
}

export type UpdateAppInput = {
  name: string
  slug: string
  s3Endpoint: string | null
  s3Region: string
  s3Bucket: string
  s3Prefix: string
  s3AccessKeyId: string
  s3SecretEncrypted: string
  s3ForcePathStyle: boolean
}

export type FinalizeInput = {
  uploadId: string
  appId: number
  channelId: number
  version: string
  metadata: JsonObject
  artifacts: { filename: string; s3Key: string; size: number; kind: ArtifactKind }[]
  release: boolean
  now: number
}

export type InsertPendingInput = {
  id: string
  appId: number
  channelId: number
  version: string
  files: PendingFile[]
  expiresAt: number
}

export type Store = {
  ping(): Promise<void>

  getAdmin(): Promise<Admin | null>
  insertAdmin(input: { id: number; passwordHash: string }): Promise<StoreResult<void>>
  changePassword(input: { passwordHash: string; updatedAt: number }): Promise<void>
  deleteAdmin(): Promise<void>
  deleteExpiredSessions(before: number): Promise<void>
  deleteSessions(): Promise<void>
  insertSession(input: { tokenHash: string; expiresAt: number }): Promise<void>
  deleteSession(tokenHash: string): Promise<void>
  getSession(tokenHash: string): Promise<Session | null>
  updateSessionExpiresAt(tokenHash: string, expiresAt: number): Promise<void>

  listApps(orderBy: 'createdAt' | 'name'): Promise<App[]>
  getApp(id: number): Promise<App | null>
  getAppBySlug(slug: string): Promise<App | null>
  createApp(input: CreateAppInput): Promise<StoreResult<App>>
  updateApp(id: number, input: UpdateAppInput): Promise<App>
  updateNotesConfig(
    appId: number,
    input: { enabled: boolean; localesJson: string; fallbackLocale: string },
  ): Promise<void>
  deleteApp(id: number): Promise<void>
  newestArtifactS3Key(appId: number): Promise<string | null>
  listArtifactS3KeysForApp(appId: number): Promise<string[]>

  listChannels(appId: number): Promise<Channel[]>
  listChannelsForApps(appIds: number[]): Promise<Channel[]>
  getChannel(appId: number, name: string): Promise<Channel | null>
  getChannelById(id: number): Promise<Channel | null>
  createChannel(appId: number, name: string): Promise<StoreResult<Channel>>
  deleteChannel(id: number): Promise<void>
  listArtifactS3KeysForChannel(channelId: number): Promise<string[]>
  setCurrentVersionId(channelId: number, versionId: number | null): Promise<void>
  promote(channelId: number, versionId: number, now: number): Promise<void>

  listVersions(channelId: number): Promise<Version[]>
  listVersionsForChannels(channelIds: number[]): Promise<Version[]>
  listPublishedVersions(channelId: number): Promise<Version[]>
  getVersion(channelId: number, version: string): Promise<Version | null>
  getVersionById(id: number): Promise<Version | null>
  getVersionForApp(appId: number, versionId: number): Promise<Version | null>
  insertVersion(input: {
    appId: number
    channelId: number
    version: string
    createdAt: number
    releasedAt?: number | null
  }): Promise<StoreResult<Version>>
  updateVersionMetadata(versionId: number, metadata: JsonObject): Promise<Version | null>
  deleteVersion(versionId: number): Promise<void>
  versionExists(channelId: number, version: string): Promise<boolean>

  listArtifacts(versionId: number): Promise<Artifact[]>
  insertArtifact(input: {
    versionId: number
    filename: string
    s3Key: string
    size: number
    kind: ArtifactKind
  }): Promise<void>
  listArtifactsForVersions(versionIds: number[]): Promise<Artifact[]>
  findPublishedArtifact(
    channelId: number,
    filename: string,
  ): Promise<{ s3Key: string; versionId: number } | null>
  listArtifactS3KeysForVersion(versionId: number): Promise<string[]>

  listExpiredPending(appId: number, now: number): Promise<PendingUpload[]>
  deletePendingUploads(ids: string[]): Promise<void>
  getPendingByChannelVersion(channelId: number, version: string): Promise<PendingUpload | null>
  getPendingById(id: string): Promise<PendingUpload | null>
  insertPending(input: InsertPendingInput): Promise<StoreResult<void>>
  setPendingExpiresAt(id: string, expiresAt: number): Promise<void>
  finalize(input: FinalizeInput): Promise<StoreResult<Version>>

  recordHit(versionId: number, kind: HitKind, now: number): Promise<void>
  sumHitBucketsForChannel(channelId: number, since: number, step: number): Promise<HitBucketRow[]>
  sumHitBucketsForVersion(versionId: number, since: number, until: number): Promise<HitBucketRow[]>
  listHitBuckets(versionId: number): Promise<HitBucket[]>

  listApiKeys(appId: number): Promise<ApiKey[]>
  insertApiKey(input: { appId: number; name: string; hash: string; hint: string }): Promise<ApiKey>
  getActiveApiKeyByHash(hash: string): Promise<ApiKey | null>
  touchApiKey(id: number, lastUsedAt: number): Promise<void>
  getApiKey(appId: number, keyId: number): Promise<ApiKey | null>
  revokeApiKey(appId: number, keyId: number, revokedAt: number): Promise<ApiKey | null>
  deleteApiKey(keyId: number): Promise<void>

  listNotes(versionId: number): Promise<ReleaseNote[]>
  listNotesForVersions(versionIds: number[]): Promise<ReleaseNote[]>
  listNotedVersionIds(channelId: number): Promise<number[]>
  upsertNote(input: {
    versionId: number
    locale: string
    markdown: string
    html: string
    text: string
  }): Promise<ReleaseNote>
  deleteNote(versionId: number, locale: string): Promise<ReleaseNote | null>
}

/**
 * Postgres `pg_advisory_lock` key for `boot()` migrate.
 * SQLite has no advisory locks; that adapter holds a libsql write
 * transaction (`BEGIN IMMEDIATE`) around the same critical section.
 */
export const MIGRATE_LOCK_KEY = 859_001

export type StoreAdapter = {
  /**
   * Connect and apply pending migrations.
   * Overlapping `boot()` calls must serialize migrate.
   */
  boot(): Promise<Store>
}
