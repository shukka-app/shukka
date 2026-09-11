import type { App } from '@shukka/store'
import { generateApiKey } from '~/lib/auth.ts'
import { encryptSecret } from '~/lib/crypto.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { clearObjectCache } from '~/lib/object-cache.ts'
import { store } from '~/lib/store.ts'
import { deleteObjects, headObject, settingsFromApp, verifyWritable } from '~/lib/storage.ts'
import type { UpdaterKind } from '~/lib/updater-kind.ts'

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

/** Fields a key may resubmit only when unchanged; `s3SecretAccessKey` is never allowed. */
export function changedProtectedFields(app: App, input: AppInput): string[] {
  const changed: string[] = []
  if (app.slug !== input.slug) changed.push('slug')
  if (app.s3Endpoint !== input.s3Endpoint) changed.push('s3Endpoint')
  if (app.s3Region !== input.s3Region) changed.push('s3Region')
  if (app.s3Bucket !== input.s3Bucket) changed.push('s3Bucket')
  if (app.s3Prefix !== input.s3Prefix) changed.push('s3Prefix')
  if (app.s3AccessKeyId !== input.s3AccessKeyId) changed.push('s3AccessKeyId')
  if (app.s3ForcePathStyle !== input.s3ForcePathStyle) changed.push('s3ForcePathStyle')
  if (input.s3SecretAccessKey !== undefined) changed.push('s3SecretAccessKey')
  return changed
}

export async function listApps() {
  return store.listApps('createdAt')
}

export async function getApp(id: number): Promise<App> {
  const app = await store.getApp(id)
  if (!app) throw new ShukkaError('not_found', 'App not found')
  return app
}

export async function getAppBySlug(slug: string): Promise<App> {
  const app = await store.getAppBySlug(slug)
  if (!app) throw new ShukkaError('not_found', `App "${slug}" not found`)
  return app
}

export async function createApp(input: AppInput): Promise<App> {
  assertSlug(input.slug)
  const secretAccessKey = input.s3SecretAccessKey
  if (!secretAccessKey) {
    throw new ShukkaError('invalid_request', 'S3 secret access key is required')
  }
  if (await store.getAppBySlug(input.slug)) {
    throw new ShukkaError('conflict', `App "${input.slug}" already exists`)
  }

  await verifyWritable({
    endpoint: input.s3Endpoint,
    region: input.s3Region,
    bucket: input.s3Bucket,
    prefix: input.s3Prefix,
    accessKeyId: input.s3AccessKeyId,
    secretAccessKey,
    forcePathStyle: input.s3ForcePathStyle,
  })

  const result = await store.createApp({
    name: input.name,
    slug: input.slug,
    s3Endpoint: input.s3Endpoint,
    s3Region: input.s3Region,
    s3Bucket: input.s3Bucket,
    s3Prefix: input.s3Prefix,
    s3AccessKeyId: input.s3AccessKeyId,
    s3SecretEncrypted: encryptSecret(secretAccessKey),
    s3ForcePathStyle: input.s3ForcePathStyle,
    updaterKind: input.updaterKind ?? 'electron',
  })
  if (!result.ok) throw new ShukkaError('conflict', `App "${input.slug}" already exists`)
  return result.value
}

export async function updateApp(id: number, input: AppInput): Promise<App> {
  const existing = await getApp(id)
  assertSlug(input.slug)
  const clash = await store.getAppBySlug(input.slug)
  if (clash && clash.id !== id) throw new ShukkaError('conflict', `App "${input.slug}" already exists`)

  const secret = input.s3SecretAccessKey ?? settingsFromApp(existing).secretAccessKey
  const nextSettings = {
    endpoint: input.s3Endpoint,
    region: input.s3Region,
    bucket: input.s3Bucket,
    prefix: input.s3Prefix,
    accessKeyId: input.s3AccessKeyId,
    secretAccessKey: secret,
    forcePathStyle: input.s3ForcePathStyle,
  }

  const storageMoved =
    input.s3Endpoint !== existing.s3Endpoint ||
    input.s3Bucket !== existing.s3Bucket ||
    input.s3Prefix !== existing.s3Prefix
  if (storageMoved) {
    const newest = await store.newestArtifactS3Key(id)
    if (newest) {
      // One probe is a deliberate sample, not a full audit of every stored object.
      const found = await headObject(nextSettings, newest)
      if (!found) {
        throw new ShukkaError(
          'invalid_request',
          'Existing artifacts were not found at the new storage location; migrate the objects first or delete the versions',
        )
      }
    }
  }

  await verifyWritable(nextSettings)

  const updated = await store.updateApp(id, {
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
  clearObjectCache()
  return updated
}

/** Deletes the app and every stored object it owns. */
export async function deleteApp(id: number): Promise<void> {
  const app = await getApp(id)
  const keys = await store.listArtifactS3KeysForApp(id)
  if (keys.length > 0) await deleteObjects(settingsFromApp(app), keys)
  await store.deleteApp(id)
  clearObjectCache()
}

export async function listApiKeys(appId: number) {
  return store.listApiKeys(appId)
}

export async function createApiKey(appId: number, name: string) {
  const { plaintext, hash, hint } = generateApiKey()
  const key = await store.insertApiKey({ appId, name, hash, hint })
  return {
    key: { id: key.id, name: key.name, hint: key.hint, createdAt: key.createdAt },
    plaintext,
  }
}

export async function revokeApiKey(appId: number, keyId: number): Promise<void> {
  const result = await store.revokeApiKey(appId, keyId, Math.floor(Date.now() / 1000))
  if (!result) throw new ShukkaError('not_found', 'API key not found')
}

/** Hard-deletes a key, but only once it has been revoked — never a live credential. */
export async function deleteApiKey(appId: number, keyId: number): Promise<void> {
  const key = await store.getApiKey(appId, keyId)
  if (!key) throw new ShukkaError('not_found', 'API key not found')
  if (!key.revokedAt) throw new ShukkaError('invalid_request', 'Only revoked API keys can be deleted')
  await store.deleteApiKey(keyId)
}
