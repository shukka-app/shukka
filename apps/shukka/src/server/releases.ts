import type { App } from '@shukka/store'
import { randomToken } from '~/lib/crypto.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { clearObjectCache } from '~/lib/object-cache.ts'
import { store } from '~/lib/store.ts'
import {
  deleteObjects,
  getObjectText,
  headObject,
  objectKey,
  presignGet,
  presignPut,
  settingsFromApp,
  type S3Settings,
} from '~/lib/storage.ts'
import type { ReleaseMetadata } from '~/lib/release-metadata.ts'
import { createChannel, getChannel, getVersion } from './channels.ts'
import { adapterFor } from './updaters/index.ts'

const PENDING_TTL_SECONDS = 60 * 60
/** Real electron-builder/Tauri metadata is a few KB; this cap only exists to bound memory. */
const MAX_METADATA_BYTES = 1024 * 1024
const nowSeconds = () => Math.floor(Date.now() / 1000)

export type PendingFile = { filename: string; s3Key: string; size: number }

export type InitInput = {
  channel: string
  version: string
  files: { filename: string; size?: number }[]
  /** Create the channel if it does not exist yet; off by default so typos fail loudly. */
  createChannel?: boolean
}

export type InitResult = {
  uploadId: string
  expiresAt: number
  files: { filename: string; key: string; uploadUrl: string }[]
}

function assertFilename(filename: string): void {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.startsWith('.')) {
    throw new ShukkaError('invalid_request', `Invalid artifact filename: "${filename}"`)
  }
}

/** Versions become a path segment, so they may not contain separators or dot segments. */
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/

function assertVersion(version: string): void {
  if (!VERSION_PATTERN.test(version) || version.includes('..')) {
    throw new ShukkaError('invalid_request', `Invalid version string: "${version}"`)
  }
}

/**
 * Purges this app's expired pending uploads and best-effort deletes the
 * objects they may have written. Scoped to one app because S3 deletion
 * needs the app's credentials; other apps clean up on their own next call.
 */
async function purgeExpiredUploads(app: App, s3: S3Settings): Promise<void> {
  const expired = await store.listExpiredPending(app.id, nowSeconds())
  if (expired.length === 0) return
  const keys = expired.flatMap((row) => row.files.map((file) => file.s3Key))
  try {
    await deleteObjects(s3, keys)
  } catch (error) {
    console.error('Expired-upload cleanup failed; objects may be orphaned:', error)
    return
  }
  await store.deletePendingUploads(expired.map((row) => row.id))
}

export async function initUpload(app: App, input: InitInput): Promise<InitResult> {
  assertVersion(input.version)
  if (input.files.length === 0) throw new ShukkaError('invalid_request', 'At least one file is required')
  const adapter = adapterFor(app.updaterKind)
  if (!adapter.hasRequiredMetadata(input.files.map((file) => file.filename))) {
    throw new ShukkaError('invalid_request', adapter.missingMetadataMessage)
  }
  for (const file of input.files) assertFilename(file.filename)

  let channel
  try {
    channel = await getChannel(app.id, input.channel)
  } catch (error) {
    if (!input.createChannel) throw error
    channel = await createChannel(app.id, input.channel)
  }

  if (await store.versionExists(channel.id, input.version)) {
    throw new ShukkaError('conflict', `Version ${input.version} already exists on channel ${channel.name}`)
  }

  const s3 = settingsFromApp(app)
  const pendingFiles: PendingFile[] = input.files.map((file) => ({
    filename: file.filename,
    s3Key: objectKey(s3, channel.name, input.version, file.filename),
    size: file.size ?? 0,
  }))

  const uploadId = randomToken(16)
  const expiresAt = nowSeconds() + PENDING_TTL_SECONDS
  await purgeExpiredUploads(app, s3)

  if (await store.getPendingByChannelVersion(channel.id, input.version)) {
    throw new ShukkaError('conflict', `Version ${input.version} already has a pending upload`)
  }

  const inserted = await store.insertPending({
    id: uploadId,
    appId: app.id,
    channelId: channel.id,
    version: input.version,
    files: pendingFiles,
    expiresAt,
  })
  if (!inserted.ok) {
    throw new ShukkaError('conflict', `Version ${input.version} already has a pending upload`)
  }

  const files = await Promise.all(
    pendingFiles.map(async (file) => ({
      filename: file.filename,
      key: file.s3Key,
      uploadUrl: await presignPut(s3, file.s3Key),
    })),
  )

  return { uploadId, expiresAt, files }
}

export type FinalizeResult = {
  versionId: number
  version: string
  channel: string
  artifacts: { filename: string; size: number; kind: 'metadata' | 'artifact' }[]
}

export async function finalizeUpload(
  app: App,
  uploadId: string,
  options: { release?: boolean; metadata?: ReleaseMetadata } = {},
): Promise<FinalizeResult> {
  const pending = await store.getPendingById(uploadId)
  if (!pending) throw new ShukkaError('not_found', 'Upload not found or already finalized')
  if (pending.appId !== app.id) throw new ShukkaError('forbidden', 'Upload belongs to another app')
  if (pending.expiresAt < nowSeconds()) {
    await purgeExpiredUploads(app, settingsFromApp(app))
    throw new ShukkaError('conflict', 'Upload expired; start a new upload')
  }

  const channel = await store.getChannelById(pending.channelId)
  if (!channel) throw new ShukkaError('not_found', 'Channel was deleted during upload')

  const s3 = settingsFromApp(app)
  const files = pending.files
  const adapter = adapterFor(app.updaterKind)

  // Every declared object must exist before the version becomes visible.
  const verified = await Promise.all(
    files.map(async (file) => {
      const head = await headObject(s3, file.s3Key)
      if (!head) throw new ShukkaError('conflict', `Artifact was not uploaded: ${file.filename}`)
      if (file.size > 0 && head.size !== file.size) {
        throw new ShukkaError('conflict', `Size mismatch for ${file.filename}: expected ${file.size}, got ${head.size}`)
      }
      return {
        ...file,
        size: head.size,
        kind: adapter.isMetadataFile(file.filename) ? ('metadata' as const) : ('artifact' as const),
      }
    }),
  )

  // Metadata that declares a version must agree with the upload, and may only
  // reference files that were actually uploaded (otherwise clients 404).
  const uploaded = new Set(verified.map((file) => file.filename))
  for (const file of verified.filter((entry) => entry.kind === 'metadata')) {
    if (file.size > MAX_METADATA_BYTES) {
      throw new ShukkaError('metadata_error', `${file.filename} exceeds the metadata size limit`)
    }
    const metadata = adapter.parseMetadata(file.filename, await getObjectText(s3, file.s3Key))
    if (metadata.version && metadata.version !== pending.version) {
      throw new ShukkaError(
        'metadata_error',
        `${file.filename} declares version ${metadata.version} but the upload declares ${pending.version}`,
      )
    }
    const missing = metadata.referenced.filter((name) => !uploaded.has(name))
    if (missing.length > 0) {
      throw new ShukkaError('metadata_error', `${file.filename} references files that were not uploaded`, missing)
    }
  }

  const release = options.release === true
  const created = await store.finalize({
    uploadId,
    appId: app.id,
    channelId: channel.id,
    version: pending.version,
    metadata: options.metadata ?? {},
    artifacts: verified.map((file) => ({
      filename: file.filename,
      s3Key: file.s3Key,
      size: file.size,
      kind: file.kind,
    })),
    release,
    now: nowSeconds(),
  })
  if (!created.ok) throw new ShukkaError('conflict', 'Version already exists')

  return {
    versionId: created.value.id,
    version: created.value.version,
    channel: channel.name,
    artifacts: verified.map((file) => ({ filename: file.filename, size: file.size, kind: file.kind })),
  }
}

/** Presigned GET for one file on a version (draft or released). Does not record a hit. */
export async function presignVersionArtifact(
  app: App,
  channelName: string,
  versionName: string,
  filename: string,
): Promise<string> {
  assertFilename(filename)
  const version = await getVersion(app.id, channelName, versionName)
  const artifact = (await listArtifacts(version.id)).find((entry) => entry.filename === filename)
  if (!artifact) throw new ShukkaError('not_found', `${filename} not found on version ${versionName}`)
  return presignGet(settingsFromApp(app), artifact.s3Key)
}

export async function listArtifacts(versionId: number) {
  return store.listArtifacts(versionId)
}

export async function listArtifactsForVersions(versionIds: number[]) {
  return store.listArtifactsForVersions(versionIds)
}

export async function deleteVersionByName(app: App, channelName: string, version: string): Promise<void> {
  await deleteVersion(app, (await getVersion(app.id, channelName, version)).id)
}

/** Removes a version, its stored objects, and repoints the channel if it was current. */
export async function deleteVersion(app: App, versionId: number): Promise<void> {
  const version = await store.getVersionForApp(app.id, versionId)
  if (!version) throw new ShukkaError('not_found', 'Version not found')

  const keys = await store.listArtifactS3KeysForVersion(versionId)
  await deleteObjects(settingsFromApp(app), keys)
  await store.deleteVersion(versionId)
  clearObjectCache()
}
