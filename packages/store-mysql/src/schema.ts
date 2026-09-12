import { sql } from 'drizzle-orm'
import type { JsonObject } from '@shukka/store'
import {
  boolean,
  index,
  int,
  json,
  mediumtext,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/mysql-core'

const now = sql`(unix_timestamp())`

/** Singleton row (id = 1) holding the self-hosted admin credential. */
export const admin = mysqlTable('admin', {
  id: int('id').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  createdAt: int('created_at').notNull().default(now),
  updatedAt: int('updated_at').notNull().default(now),
})

export const sessions = mysqlTable('sessions', {
  /** SHA-256 of the cookie token; the token itself is never stored. */
  tokenHash: varchar('token_hash', { length: 255 }).primaryKey(),
  createdAt: int('created_at').notNull().default(now),
  expiresAt: int('expires_at').notNull(),
})

export const apps = mysqlTable('apps', {
  id: int('id').primaryKey().autoincrement(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  s3Endpoint: text('s3_endpoint'),
  s3Region: varchar('s3_region', { length: 255 }).notNull(),
  s3Bucket: varchar('s3_bucket', { length: 255 }).notNull(),
  s3Prefix: varchar('s3_prefix', { length: 255 }).notNull().default(''),
  s3AccessKeyId: varchar('s3_access_key_id', { length: 255 }).notNull(),
  /** AES-256-GCM ciphertext, see docs/adr/per-app-s3-and-secrets.md. */
  s3SecretEncrypted: text('s3_secret_encrypted').notNull(),
  s3ForcePathStyle: boolean('s3_force_path_style').notNull().default(false),
  releaseLogEnabled: boolean('release_log_enabled').notNull().default(false),
  /** JSON array of BCP-47 tags the app publishes release notes in. */
  releaseLogLocales: text('release_log_locales').notNull().default('[]'),
  releaseLogFallbackLocale: varchar('release_log_fallback_locale', { length: 32 }).notNull().default('en-US'),
  /** Which client feed this app serves. Set at create; not changed afterwards. */
  updaterKind: varchar('updater_kind', { length: 16, enum: ['electron', 'tauri', 'sparkle'] })
    .notNull()
    .default('electron'),
  createdAt: int('created_at').notNull().default(now),
})

export const channels = mysqlTable(
  'channels',
  {
    id: int('id').primaryKey().autoincrement(),
    appId: int('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    /** Points at versions.id; intentionally not an FK to avoid a table cycle. */
    currentVersionId: int('current_version_id'),
    createdAt: int('created_at').notNull().default(now),
  },
  (t) => [uniqueIndex('channels_app_name_unique').on(t.appId, t.name)],
)

export const versions = mysqlTable(
  'versions',
  {
    id: int('id').primaryKey().autoincrement(),
    appId: int('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    channelId: int('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    version: varchar('version', { length: 255 }).notNull(),
    createdAt: int('created_at').notNull().default(now),
    /** Null = draft; set once on first promote or `release: true` finalize. */
    releasedAt: int('released_at'),
    metadata: json('metadata').$type<JsonObject>().notNull().default(sql`('{}')`),
    metadataHits: int('metadata_hits').notNull().default(0),
    artifactHits: int('artifact_hits').notNull().default(0),
  },
  (t) => [uniqueIndex('versions_channel_version_unique').on(t.channelId, t.version)],
)

/**
 * Pre-aggregated hit counts per version/kind/UTC hour; written in the same
 * transaction as the version counter increment (ADR: hit-trends).
 */
export const hitBuckets = mysqlTable(
  'hit_buckets',
  {
    id: int('id').primaryKey().autoincrement(),
    versionId: int('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16, enum: ['metadata', 'artifact'] }).notNull(),
    /** Unix seconds truncated to the hour (UTC). */
    hourStart: int('hour_start').notNull(),
    count: int('count').notNull().default(0),
  },
  (t) => [uniqueIndex('hit_buckets_version_kind_hour_unique').on(t.versionId, t.kind, t.hourStart)],
)

/**
 * Mutable per-version release notes, one row per locale (ADR: release-log).
 * `html` / `text` are write-time render products; reads stay pure SELECTs.
 */
export const releaseNotes = mysqlTable(
  'release_notes',
  {
    id: int('id').primaryKey().autoincrement(),
    versionId: int('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    /** BCP-47 tag, e.g. en-US. */
    locale: varchar('locale', { length: 32 }).notNull(),
    markdown: mediumtext('markdown').notNull(),
    /** Sanitized render of `markdown`; raw HTML in the source is stripped. */
    html: mediumtext('html').notNull(),
    text: mediumtext('text').notNull(),
  },
  (t) => [uniqueIndex('release_notes_version_locale_unique').on(t.versionId, t.locale)],
)

export const artifacts = mysqlTable(
  'artifacts',
  {
    id: int('id').primaryKey().autoincrement(),
    versionId: int('version_id')
      .notNull()
      .references(() => versions.id, { onDelete: 'cascade' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    s3Key: varchar('s3_key', { length: 1024 }).notNull(),
    size: int('size').notNull(),
    /** 'metadata' for latest*.yml served inline, 'artifact' for redirected binaries. */
    kind: varchar('kind', { length: 16, enum: ['metadata', 'artifact'] }).notNull(),
  },
  (t) => [index('artifacts_version_idx').on(t.versionId), index('artifacts_filename_idx').on(t.filename)],
)

export const apiKeys = mysqlTable(
  'api_keys',
  {
    id: int('id').primaryKey().autoincrement(),
    appId: int('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    /** SHA-256 of the plaintext key; plaintext is shown once at creation only. */
    hash: varchar('hash', { length: 64 }).notNull().unique(),
    /** Non-secret display hint, e.g. "shk_a1b2…". */
    hint: varchar('hint', { length: 64 }).notNull(),
    createdAt: int('created_at').notNull().default(now),
    lastUsedAt: int('last_used_at'),
    revokedAt: int('revoked_at'),
  },
  (t) => [index('api_keys_app_idx').on(t.appId)],
)

/** An upload between init and finalize; invisible to the update feed. */
export const pendingUploads = mysqlTable(
  'pending_uploads',
  {
    id: varchar('id', { length: 255 }).primaryKey(),
    appId: int('app_id')
      .notNull()
      .references(() => apps.id, { onDelete: 'cascade' }),
    channelId: int('channel_id')
      .notNull()
      .references(() => channels.id, { onDelete: 'cascade' }),
    version: varchar('version', { length: 255 }).notNull(),
    /** JSON array of { filename, s3Key, size }. */
    files: text('files').notNull(),
    createdAt: int('created_at').notNull().default(now),
    expiresAt: int('expires_at').notNull(),
  },
  (t) => [uniqueIndex('pending_uploads_channel_version_unique').on(t.channelId, t.version)],
)
