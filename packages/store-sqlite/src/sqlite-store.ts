import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type {
  ApiKey,
  App,
  Channel,
  CreateAppInput,
  FinalizeInput,
  HitBucketRow,
  InsertPendingInput,
  PendingFile,
  PendingUpload,
  Store,
  StoreResult,
  UpdateAppInput,
  Version,
} from '@shukka/store'
import { isUniqueConstraint } from './conflict.ts'
import * as schema from './schema.ts'

const DEFAULT_CHANNEL = 'stable'
const HOUR = 3600

type Database = LibSQLDatabase<typeof schema>
type PendingRow = typeof schema.pendingUploads.$inferSelect

function conflict<T>(error: unknown): StoreResult<T> {
  if (isUniqueConstraint(error)) return { ok: false, error: 'conflict' }
  throw error
}

function asPending(row: PendingRow): PendingUpload {
  return { ...row, files: JSON.parse(row.files) as PendingFile[] }
}

export function createSqliteStore(db: Database): Store {
  return {
    async ping() {
      await db.run(sql`SELECT 1`)
    },

    async getAdmin() {
      const [row] = await db.select().from(schema.admin).limit(1)
      return row ?? null
    },

    async insertAdmin(input) {
      try {
        await db.insert(schema.admin).values({ id: input.id, passwordHash: input.passwordHash })
        return { ok: true, value: undefined }
      } catch (error) {
        return conflict(error)
      }
    },

    async changePassword(input) {
      await db.transaction(async (tx) => {
        await tx.update(schema.admin).set({ passwordHash: input.passwordHash, updatedAt: input.updatedAt })
        await tx.delete(schema.sessions)
      })
    },

    async deleteAdmin() {
      await db.delete(schema.admin)
    },

    async deleteExpiredSessions(before) {
      await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, before))
    },

    async deleteSessions() {
      await db.delete(schema.sessions)
    },

    async insertSession(input) {
      await db.insert(schema.sessions).values({ tokenHash: input.tokenHash, expiresAt: input.expiresAt })
    },

    async deleteSession(tokenHash) {
      await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash))
    },

    async getSession(tokenHash) {
      const [row] = await db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash)).limit(1)
      return row ?? null
    },

    async updateSessionExpiresAt(tokenHash, expiresAt) {
      await db.update(schema.sessions).set({ expiresAt }).where(eq(schema.sessions.tokenHash, tokenHash))
    },

    async listApps(orderBy) {
      return db
        .select()
        .from(schema.apps)
        .orderBy(orderBy === 'name' ? schema.apps.name : desc(schema.apps.createdAt))
    },

    async getApp(id) {
      const [row] = await db.select().from(schema.apps).where(eq(schema.apps.id, id)).limit(1)
      return row ?? null
    },

    async getAppBySlug(slug) {
      const [row] = await db.select().from(schema.apps).where(eq(schema.apps.slug, slug)).limit(1)
      return row ?? null
    },

    async createApp(input: CreateAppInput): Promise<StoreResult<App>> {
      try {
        const created = await db.transaction(async (tx) => {
          const [app] = await tx.insert(schema.apps).values(input).returning()
          await tx.insert(schema.channels).values({ appId: app.id, name: DEFAULT_CHANNEL })
          return app
        })
        return { ok: true, value: created }
      } catch (error) {
        return conflict(error)
      }
    },

    async updateApp(id, input: UpdateAppInput) {
      const [updated] = await db.update(schema.apps).set(input).where(eq(schema.apps.id, id)).returning()
      if (!updated) throw new Error(`App ${id} was not updated`)
      return updated
    },

    async updateNotesConfig(appId, input) {
      await db
        .update(schema.apps)
        .set({
          releaseLogEnabled: input.enabled,
          releaseLogLocales: input.localesJson,
          releaseLogFallbackLocale: input.fallbackLocale,
        })
        .where(eq(schema.apps.id, appId))
    },

    async deleteApp(id) {
      await db.delete(schema.apps).where(eq(schema.apps.id, id))
    },

    async newestArtifactS3Key(appId) {
      const [row] = await db
        .select({ s3Key: schema.artifacts.s3Key })
        .from(schema.artifacts)
        .innerJoin(schema.versions, eq(schema.artifacts.versionId, schema.versions.id))
        .where(eq(schema.versions.appId, appId))
        .orderBy(desc(schema.versions.id))
        .limit(1)
      return row?.s3Key ?? null
    },

    async listArtifactS3KeysForApp(appId) {
      const rows = await db
        .select({ s3Key: schema.artifacts.s3Key })
        .from(schema.artifacts)
        .innerJoin(schema.versions, eq(schema.artifacts.versionId, schema.versions.id))
        .where(eq(schema.versions.appId, appId))
      return rows.map((row) => row.s3Key)
    },

    async listChannels(appId) {
      return db
        .select()
        .from(schema.channels)
        .where(eq(schema.channels.appId, appId))
        .orderBy(schema.channels.createdAt, schema.channels.id)
    },

    async listChannelsForApps(appIds) {
      if (appIds.length === 0) return []
      return db
        .select()
        .from(schema.channels)
        .where(inArray(schema.channels.appId, appIds))
        .orderBy(schema.channels.createdAt, schema.channels.id)
    },

    async getChannel(appId, name) {
      const [row] = await db
        .select()
        .from(schema.channels)
        .where(and(eq(schema.channels.appId, appId), eq(schema.channels.name, name)))
        .limit(1)
      return row ?? null
    },

    async getChannelById(id) {
      const [row] = await db.select().from(schema.channels).where(eq(schema.channels.id, id)).limit(1)
      return row ?? null
    },

    async createChannel(appId, name): Promise<StoreResult<Channel>> {
      try {
        const [created] = await db.insert(schema.channels).values({ appId, name }).returning()
        return { ok: true, value: created }
      } catch (error) {
        return conflict(error)
      }
    },

    async deleteChannel(id) {
      await db.delete(schema.channels).where(eq(schema.channels.id, id))
    },

    async listArtifactS3KeysForChannel(channelId) {
      const rows = await db
        .select({ s3Key: schema.artifacts.s3Key })
        .from(schema.artifacts)
        .innerJoin(schema.versions, eq(schema.artifacts.versionId, schema.versions.id))
        .where(eq(schema.versions.channelId, channelId))
      return rows.map((row) => row.s3Key)
    },

    async setCurrentVersionId(channelId, versionId) {
      await db.update(schema.channels).set({ currentVersionId: versionId }).where(eq(schema.channels.id, channelId))
    },

    async promote(channelId, versionId, now) {
      await db.transaction(async (tx) => {
        const [row] = await tx.select().from(schema.versions).where(eq(schema.versions.id, versionId)).limit(1)
        if (row && row.releasedAt == null) {
          await tx.update(schema.versions).set({ releasedAt: now }).where(eq(schema.versions.id, versionId))
        }
        await tx.update(schema.channels).set({ currentVersionId: versionId }).where(eq(schema.channels.id, channelId))
      })
    },

    async listVersions(channelId) {
      return db
        .select()
        .from(schema.versions)
        .where(eq(schema.versions.channelId, channelId))
        .orderBy(desc(schema.versions.createdAt), desc(schema.versions.id))
    },

    async listVersionsForChannels(channelIds) {
      if (channelIds.length === 0) return []
      return db
        .select()
        .from(schema.versions)
        .where(inArray(schema.versions.channelId, channelIds))
        .orderBy(desc(schema.versions.createdAt), desc(schema.versions.id))
    },

    async listPublishedVersions(channelId) {
      return db
        .select()
        .from(schema.versions)
        .where(and(eq(schema.versions.channelId, channelId), isNotNull(schema.versions.releasedAt)))
        .orderBy(desc(schema.versions.releasedAt), desc(schema.versions.id))
    },

    async getVersion(channelId, version) {
      const [row] = await db
        .select()
        .from(schema.versions)
        .where(and(eq(schema.versions.channelId, channelId), eq(schema.versions.version, version)))
        .limit(1)
      return row ?? null
    },

    async getVersionById(id) {
      const [row] = await db.select().from(schema.versions).where(eq(schema.versions.id, id)).limit(1)
      return row ?? null
    },

    async getVersionForApp(appId, versionId) {
      const [row] = await db
        .select()
        .from(schema.versions)
        .where(and(eq(schema.versions.id, versionId), eq(schema.versions.appId, appId)))
        .limit(1)
      return row ?? null
    },

    async insertVersion(input) {
      try {
        const [row] = await db.insert(schema.versions).values(input).returning()
        return { ok: true, value: row }
      } catch (error) {
        return conflict(error)
      }
    },

    async updateVersionMetadata(versionId, metadata) {
      const [saved] = await db
        .update(schema.versions)
        .set({ metadata })
        .where(eq(schema.versions.id, versionId))
        .returning()
      return saved ?? null
    },

    async deleteVersion(versionId) {
      await db.transaction(async (tx) => {
        const [version] = await tx.select().from(schema.versions).where(eq(schema.versions.id, versionId)).limit(1)
        if (!version) return
        const [channel] = await tx.select().from(schema.channels).where(eq(schema.channels.id, version.channelId)).limit(1)
        await tx.delete(schema.versions).where(eq(schema.versions.id, versionId))
        if (channel?.currentVersionId === versionId) {
          const [fallback] = await tx
            .select()
            .from(schema.versions)
            .where(and(eq(schema.versions.channelId, version.channelId), isNotNull(schema.versions.releasedAt)))
            .orderBy(desc(schema.versions.releasedAt))
            .limit(1)
          await tx
            .update(schema.channels)
            .set({ currentVersionId: fallback?.id ?? null })
            .where(eq(schema.channels.id, channel.id))
        }
      })
    },

    async versionExists(channelId, version) {
      const [row] = await db
        .select({ id: schema.versions.id })
        .from(schema.versions)
        .where(and(eq(schema.versions.channelId, channelId), eq(schema.versions.version, version)))
        .limit(1)
      return row !== undefined
    },

    async listArtifacts(versionId) {
      return db
        .select()
        .from(schema.artifacts)
        .where(eq(schema.artifacts.versionId, versionId))
        .orderBy(schema.artifacts.filename)
    },

    async insertArtifact(input) {
      await db.insert(schema.artifacts).values(input)
    },

    async listArtifactsForVersions(versionIds) {
      if (versionIds.length === 0) return []
      return db
        .select()
        .from(schema.artifacts)
        .where(inArray(schema.artifacts.versionId, versionIds))
        .orderBy(schema.artifacts.filename)
    },

    async findPublishedArtifact(channelId, filename) {
      const [row] = await db
        .select({ s3Key: schema.artifacts.s3Key, versionId: schema.artifacts.versionId })
        .from(schema.artifacts)
        .innerJoin(schema.versions, eq(schema.artifacts.versionId, schema.versions.id))
        .where(
          and(
            eq(schema.versions.channelId, channelId),
            eq(schema.artifacts.filename, filename),
            isNotNull(schema.versions.releasedAt),
          ),
        )
        .orderBy(desc(schema.versions.releasedAt), desc(schema.versions.id))
        .limit(1)
      return row ?? null
    },

    async listArtifactS3KeysForVersion(versionId) {
      const rows = await db
        .select({ s3Key: schema.artifacts.s3Key })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.versionId, versionId))
      return rows.map((row) => row.s3Key)
    },

    async listExpiredPending(appId, now) {
      const rows = await db
        .select()
        .from(schema.pendingUploads)
        .where(and(eq(schema.pendingUploads.appId, appId), lt(schema.pendingUploads.expiresAt, now)))
      return rows.map(asPending)
    },

    async deletePendingUploads(ids) {
      if (ids.length === 0) return
      await db.delete(schema.pendingUploads).where(inArray(schema.pendingUploads.id, ids))
    },

    async getPendingByChannelVersion(channelId, version) {
      const [row] = await db
        .select()
        .from(schema.pendingUploads)
        .where(and(eq(schema.pendingUploads.channelId, channelId), eq(schema.pendingUploads.version, version)))
        .limit(1)
      return row ? asPending(row) : null
    },

    async getPendingById(id) {
      const [row] = await db.select().from(schema.pendingUploads).where(eq(schema.pendingUploads.id, id)).limit(1)
      return row ? asPending(row) : null
    },

    async insertPending(input: InsertPendingInput): Promise<StoreResult<void>> {
      try {
        await db.insert(schema.pendingUploads).values({
          id: input.id,
          appId: input.appId,
          channelId: input.channelId,
          version: input.version,
          files: JSON.stringify(input.files),
          expiresAt: input.expiresAt,
        })
        return { ok: true, value: undefined }
      } catch (error) {
        return conflict(error)
      }
    },

    async setPendingExpiresAt(id, expiresAt) {
      await db.update(schema.pendingUploads).set({ expiresAt }).where(eq(schema.pendingUploads.id, id))
    },

    async finalize(input: FinalizeInput): Promise<StoreResult<Version>> {
      try {
        const created = await db.transaction(async (tx) => {
          const [version] = await tx
            .insert(schema.versions)
            .values({
              appId: input.appId,
              channelId: input.channelId,
              version: input.version,
              metadata: input.metadata,
              createdAt: input.now,
              releasedAt: input.release ? input.now : null,
            })
            .returning()
          await tx.insert(schema.artifacts).values(
            input.artifacts.map((file) => ({
              versionId: version.id,
              filename: file.filename,
              s3Key: file.s3Key,
              size: file.size,
              kind: file.kind,
            })),
          )
          if (input.release) {
            await tx
              .update(schema.channels)
              .set({ currentVersionId: version.id })
              .where(eq(schema.channels.id, input.channelId))
          }
          await tx.delete(schema.pendingUploads).where(eq(schema.pendingUploads.id, input.uploadId))
          return version
        })
        return { ok: true, value: created }
      } catch (error) {
        return conflict(error)
      }
    },

    async recordHit(versionId, kind, now) {
      const hourStart = Math.floor(now / HOUR) * HOUR
      const column = kind === 'metadata' ? schema.versions.metadataHits : schema.versions.artifactHits
      await db.transaction(async (tx) => {
        await tx
          .update(schema.versions)
          .set({ [kind === 'metadata' ? 'metadataHits' : 'artifactHits']: sql`${column} + 1` })
          .where(eq(schema.versions.id, versionId))
        await tx
          .insert(schema.hitBuckets)
          .values({ versionId, kind, hourStart, count: 1 })
          .onConflictDoUpdate({
            target: [schema.hitBuckets.versionId, schema.hitBuckets.kind, schema.hitBuckets.hourStart],
            set: { count: sql`${schema.hitBuckets.count} + 1` },
          })
      })
    },

    async sumHitBucketsForChannel(channelId, since, step): Promise<HitBucketRow[]> {
      const bucket = sql<number>`cast(${schema.hitBuckets.hourStart} / ${step} as integer) * ${step}`
      return db
        .select({ bucket, kind: schema.hitBuckets.kind, count: sql<number>`sum(${schema.hitBuckets.count})` })
        .from(schema.hitBuckets)
        .innerJoin(schema.versions, eq(schema.hitBuckets.versionId, schema.versions.id))
        .where(and(eq(schema.versions.channelId, channelId), gte(schema.hitBuckets.hourStart, since)))
        .groupBy(bucket, schema.hitBuckets.kind)
    },

    async sumHitBucketsForVersion(versionId, since, until): Promise<HitBucketRow[]> {
      const day = 86400
      const bucket = sql<number>`cast(${schema.hitBuckets.hourStart} / ${day} as integer) * ${day}`
      return db
        .select({ bucket, kind: schema.hitBuckets.kind, count: sql<number>`sum(${schema.hitBuckets.count})` })
        .from(schema.hitBuckets)
        .where(
          and(
            eq(schema.hitBuckets.versionId, versionId),
            gte(schema.hitBuckets.hourStart, since),
            lt(schema.hitBuckets.hourStart, until),
          ),
        )
        .groupBy(bucket, schema.hitBuckets.kind)
    },

    async listHitBuckets(versionId) {
      return db.select().from(schema.hitBuckets).where(eq(schema.hitBuckets.versionId, versionId))
    },

    async listApiKeys(appId) {
      return db
        .select()
        .from(schema.apiKeys)
        .where(eq(schema.apiKeys.appId, appId))
        .orderBy(desc(schema.apiKeys.createdAt))
    },

    async insertApiKey(input): Promise<ApiKey> {
      const [key] = await db.insert(schema.apiKeys).values(input).returning()
      if (!key) throw new Error('API key insert returned no row')
      return key
    },

    async getActiveApiKeyByHash(hash) {
      const [row] = await db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.hash, hash), isNull(schema.apiKeys.revokedAt)))
        .limit(1)
      return row ?? null
    },

    async touchApiKey(id, lastUsedAt) {
      await db.update(schema.apiKeys).set({ lastUsedAt }).where(eq(schema.apiKeys.id, id))
    },

    async getApiKey(appId, keyId) {
      const [row] = await db
        .select()
        .from(schema.apiKeys)
        .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.appId, appId)))
        .limit(1)
      return row ?? null
    },

    async revokeApiKey(appId, keyId, revokedAt) {
      const [row] = await db
        .update(schema.apiKeys)
        .set({ revokedAt })
        .where(and(eq(schema.apiKeys.id, keyId), eq(schema.apiKeys.appId, appId)))
        .returning()
      return row ?? null
    },

    async deleteApiKey(keyId) {
      await db.delete(schema.apiKeys).where(eq(schema.apiKeys.id, keyId))
    },

    async listNotes(versionId) {
      return db
        .select()
        .from(schema.releaseNotes)
        .where(eq(schema.releaseNotes.versionId, versionId))
        .orderBy(asc(schema.releaseNotes.locale))
    },

    async listNotesForVersions(versionIds) {
      if (versionIds.length === 0) return []
      return db
        .select()
        .from(schema.releaseNotes)
        .where(inArray(schema.releaseNotes.versionId, versionIds))
        .orderBy(asc(schema.releaseNotes.locale))
    },

    async listNotedVersionIds(channelId) {
      const rows = await db
        .selectDistinct({ versionId: schema.releaseNotes.versionId })
        .from(schema.releaseNotes)
        .innerJoin(schema.versions, eq(schema.releaseNotes.versionId, schema.versions.id))
        .where(eq(schema.versions.channelId, channelId))
      return rows.map((row) => row.versionId)
    },

    async upsertNote(input) {
      const [note] = await db
        .insert(schema.releaseNotes)
        .values(input)
        .onConflictDoUpdate({
          target: [schema.releaseNotes.versionId, schema.releaseNotes.locale],
          set: { markdown: input.markdown, html: input.html, text: input.text },
        })
        .returning()
      if (!note) throw new Error('Note upsert returned no row')
      return note
    },

    async deleteNote(versionId, locale) {
      const [deleted] = await db
        .delete(schema.releaseNotes)
        .where(and(eq(schema.releaseNotes.versionId, versionId), eq(schema.releaseNotes.locale, locale)))
        .returning()
      return deleted ?? null
    },
  }
}
