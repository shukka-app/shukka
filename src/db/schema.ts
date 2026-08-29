import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const now = sql`(unixepoch())`

/** Singleton row (id = 1) holding the self-hosted admin credential. */
export const admin = sqliteTable('admin', {
  id: integer('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
})

export const sessions = sqliteTable('sessions', {
  /** SHA-256 of the cookie token; the token itself is never stored. */
  tokenHash: text('token_hash').primaryKey(),
  createdAt: integer('created_at').notNull().default(now),
  expiresAt: integer('expires_at').notNull(),
})

export const apps = sqliteTable('apps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  s3Endpoint: text('s3_endpoint'),
  s3Region: text('s3_region').notNull(),
  s3Bucket: text('s3_bucket').notNull(),
  s3Prefix: text('s3_prefix').notNull().default(''),
  s3AccessKeyId: text('s3_access_key_id').notNull(),
  /** AES-256-GCM ciphertext, see docs/adr/per-app-s3-and-secrets.md. */
  s3SecretEncrypted: text('s3_secret_encrypted').notNull(),
  s3ForcePathStyle: integer('s3_force_path_style', { mode: 'boolean' }).notNull().default(false),
  releaseLogEnabled: integer('release_log_enabled', { mode: 'boolean' }).notNull().default(false),
  /** JSON array of BCP-47 tags the app publishes release notes in. */
  releaseLogLocales: text('release_log_locales').notNull().default('[]'),
  releaseLogFallbackLocale: text('release_log_fallback_locale').notNull().default('en-US'),
  /** Which client feed this app serves. Set at create; not changed afterwards. */
  updaterKind: text('updater_kind', { enum: ['electron', 'tauri', 'sparkle'] }).notNull().default('electron'),
  createdAt: integer('created_at').notNull().default(now),
})

export const channels = sqliteTable(
  'channels',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    appId: integer('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Points at versions.id; intentionally not an FK to avoid a table cycle. */
    currentVersionId: integer('current_version_id'),
    createdAt: integer('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('channels_app_name_unique').on(t.appId, t.name)],
)

export const versions = sqliteTable(
  'versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    appId: integer('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    /** Null = draft; set once on first promote or `release: true` finalize. */
    releasedAt: integer('released_at'),
    metadataHits: integer('metadata_hits').notNull().default(0),
    artifactHits: integer('artifact_hits').notNull().default(0),
  },
  (t) => [uniqueIndex('versions_channel_version_unique').on(t.channelId, t.version)],
)

/**
 * Pre-aggregated hit counts per version/kind/UTC hour; written in the same
 * transaction as the version counter increment (ADR: hit-trends).
 */
export const hitBuckets = sqliteTable(
  'hit_buckets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    versionId: integer('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['metadata', 'artifact'] }).notNull(),
    /** Unix seconds truncated to the hour (UTC). */
    hourStart: integer('hour_start').notNull(),
    count: integer('count').notNull().default(0),
  },
  (t) => [uniqueIndex('hit_buckets_version_kind_hour_unique').on(t.versionId, t.kind, t.hourStart)],
)

/**
 * Mutable per-version release notes, one row per locale (ADR: release-log).
 * `html` / `text` are write-time render products; reads stay pure SELECTs.
 */
export const releaseNotes = sqliteTable(
  'release_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    versionId: integer('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    /** BCP-47 tag, e.g. en-US. */
    locale: text('locale').notNull(),
    markdown: text('markdown').notNull(),
    /** Sanitized render of `markdown`; raw HTML in the source is stripped. */
    html: text('html').notNull(),
    text: text('text').notNull(),
  },
  (t) => [uniqueIndex('release_notes_version_locale_unique').on(t.versionId, t.locale)],
)

export const artifacts = sqliteTable(
  'artifacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    versionId: integer('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(),
    s3Key: text('s3_key').notNull(),
    size: integer('size').notNull(),
    /** 'metadata' for latest*.yml served inline, 'artifact' for redirected binaries. */
    kind: text('kind', { enum: ['metadata', 'artifact'] }).notNull(),
  },
  (t) => [index('artifacts_version_idx').on(t.versionId), index('artifacts_filename_idx').on(t.filename)],
)

export const apiKeys = sqliteTable(
  'api_keys',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    appId: integer('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** SHA-256 of the plaintext key; plaintext is shown once at creation only. */
    hash: text('hash').notNull().unique(),
    /** Non-secret display hint, e.g. "shk_a1b2…". */
    hint: text('hint').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    lastUsedAt: integer('last_used_at'),
    revokedAt: integer('revoked_at'),
  },
  (t) => [index('api_keys_app_idx').on(t.appId)],
)

/** An upload between init and finalize; invisible to the update feed. */
export const pendingUploads = sqliteTable(
  'pending_uploads',
  {
    id: text('id').primaryKey(),
    appId: integer('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    channelId: integer('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    version: text('version').notNull(),
    /** JSON array of { filename, s3Key, size }. */
    files: text('files').notNull(),
    createdAt: integer('created_at').notNull().default(now),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [uniqueIndex('pending_uploads_channel_version_unique').on(t.channelId, t.version)],
)

export type App = typeof apps.$inferSelect
export type Channel = typeof channels.$inferSelect
export type Version = typeof versions.$inferSelect
export type HitBucket = typeof hitBuckets.$inferSelect
export type ReleaseNote = typeof releaseNotes.$inferSelect
export type Artifact = typeof artifacts.$inferSelect
export type ApiKey = typeof apiKeys.$inferSelect
