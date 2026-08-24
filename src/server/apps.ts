import { and, desc, eq } from 'drizzle-orm'
import { db } from '~/db/index.ts'
import { apiKeys, apps, artifacts, channels, versions } from '~/db/schema.ts'
import { encryptSecret } from '~/lib/crypto.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { clearObjectCache } from '~/lib/object-cache.ts'
import { deleteObjects, settingsFromApp, verifyWritable } from '~/lib/storage.ts'
import type { UpdaterKind } from '~/lib/updater-kind.ts'
import type { App } from '~/db/schema.ts'

export const DEFAULT_CHANNEL = 'stable'

export type AppInput = {
  name: string
  slug: string
  s3Endpoint: string | null
  s3Region: string
  s3Bucket: string
  s3Prefix: string
  s3AccessKeyId: string
  /** Omit on update to keep the stored secret. */
  s3SecretAccessKey?: string
  s3ForcePathStyle: boolean
  /** Create only. Omitted → electron. Ignored on update. */
  updaterKind?: UpdaterKind
}

export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/

export function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) {
    throw new ShukkaError(
      'invalid_request',
      'Slug must be lowercase letters, digits and dashes, starting with a letter or digit',
    )
  }
}

export function listApps() {
  return db.select().from(apps).orderBy(desc(apps.createdAt)).all()
}

export function getApp(id: number): App {
  const app = db.select().from(apps).where(eq(apps.id, id)).get()
  if (!app) throw new ShukkaError('not_found', 'App not found')
  return app
}

export function getAppBySlug(slug: string): App {
  const app = db.select().from(apps).where(eq(apps.slug, slug)).get()
  if (!app) throw new ShukkaError('not_found', `App "${slug}" not found`)
  return app
}

export async function createApp(input: AppInput): Promise<App> {
  assertSlug(input.slug)
  if (!input.s3SecretAccessKey) {
    throw new ShukkaError('invalid_request', 'S3 secret access key is required')
  }
  if (db.select().from(apps).where(eq(apps.slug, input.slug)).get()) {
    throw new ShukkaError('conflict', `App "${input.slug}" already exists`)
  }

  await verifyWritable({
    endpoint: input.s3Endpoint,
    region: input.s3Region,
    bucket: input.s3Bucket,
    prefix: input.s3Prefix,
    accessKeyId: input.s3AccessKeyId,
    secretAccessKey: input.s3SecretAccessKey,
    forcePathStyle: input.s3ForcePathStyle,
  })

  const app = db
    .insert(apps)
    .values({
      name: input.name,
      slug: input.slug,
      s3Endpoint: input.s3Endpoint,
      s3Region: input.s3Region,
      s3Bucket: input.s3Bucket,
      s3Prefix: input.s3Prefix,
      s3AccessKeyId: input.s3AccessKeyId,
      s3SecretEncrypted: encryptSecret(input.s3SecretAccessKey),
      s3ForcePathStyle: input.s3ForcePathStyle,
      updaterKind: input.updaterKind ?? 'electron',
    })
    .returning()
    .get()

  db.insert(channels).values({ appId: app.id, name: DEFAULT_CHANNEL }).run()
  return app
}

export async function updateApp(id: number, input: AppInput): Promise<App> {
  const existing = getApp(id)
  assertSlug(input.slug)
  const clash = db.select().from(apps).where(eq(apps.slug, input.slug)).get()
  if (clash && clash.id !== id) throw new ShukkaError('conflict', `App "${input.slug}" already exists`)

  const secret = input.s3SecretAccessKey ?? settingsFromApp(existing).secretAccessKey
  await verifyWritable({
    endpoint: input.s3Endpoint,
    region: input.s3Region,
    bucket: input.s3Bucket,
    prefix: input.s3Prefix,
    accessKeyId: input.s3AccessKeyId,
    secretAccessKey: secret,
    forcePathStyle: input.s3ForcePathStyle,
  })

  const updated = db
    .update(apps)
    .set({
      name: input.name,
      slug: input.slug,
      s3Endpoint: input.s3Endpoint,
      s3Region: input.s3Region,
      s3Bucket: input.s3Bucket,
      s3Prefix: input.s3Prefix,
      s3AccessKeyId: input.s3AccessKeyId,
      s3SecretEncrypted: encryptSecret(secret),
      s3ForcePathStyle: input.s3ForcePathStyle,
    })
    .where(eq(apps.id, id))
    .returning()
    .get()
  clearObjectCache()
  return updated
}

/** Deletes the app and every stored object it owns. */
export async function deleteApp(id: number): Promise<void> {
  const app = getApp(id)
  const keys = db
    .select({ s3Key: artifacts.s3Key })
    .from(artifacts)
    .innerJoin(versions, eq(artifacts.versionId, versions.id))
    .where(eq(versions.appId, id))
    .all()
    .map((row) => row.s3Key)

  if (keys.length > 0) await deleteObjects(settingsFromApp(app), keys)
  db.delete(apps).where(eq(apps.id, id)).run()
  clearObjectCache()
}

export function listApiKeys(appId: number) {
  return db.select().from(apiKeys).where(eq(apiKeys.appId, appId)).orderBy(desc(apiKeys.createdAt)).all()
}

export function revokeApiKey(appId: number, keyId: number): void {
  const result = db
    .update(apiKeys)
    .set({ revokedAt: Math.floor(Date.now() / 1000) })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.appId, appId)))
    .returning()
    .get()
  if (!result) throw new ShukkaError('not_found', 'API key not found')
}

/** Hard-deletes a key, but only once it has been revoked — never a live credential. */
export function deleteApiKey(appId: number, keyId: number): void {
  const key = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.appId, appId)))
    .get()
  if (!key) throw new ShukkaError('not_found', 'API key not found')
  if (!key.revokedAt) throw new ShukkaError('invalid_request', 'Only revoked API keys can be deleted')
  db.delete(apiKeys).where(eq(apiKeys.id, keyId)).run()
}
