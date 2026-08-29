import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { randomToken } from '~/lib/crypto.ts'
import { db } from '~/db/index.ts'
import { artifacts, channels, pendingUploads, versions } from '~/db/schema.ts'
import { isUniqueConstraint, ShukkaError } from '~/lib/errors.ts'
import { clearObjectCache } from '~/lib/object-cache.ts'
import { deleteObjects, getObjectText, headObject, objectKey, presignGet, presignPut, settingsFromApp } from '~/lib/storage.ts'
import { createChannel, getChannel, getVersion } from './channels.ts'
import { adapterFor } from './updaters/index.ts'
import type { App } from '~/db/schema.ts'

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
    channel = getChannel(app.id, input.channel)
  } catch (error) {
    if (!input.createChannel) throw error
    channel = createChannel(app.id, input.channel)
  }

  const clash = db
    .select()
    .from(versions)
    .where(and(eq(versions.channelId, channel.id), eq(versions.version, input.version)))
    .get()
  if (clash) {
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
  db.delete(pendingUploads).where(sql`${pendingUploads.expiresAt} < ${nowSeconds()}`).run()

  const livePending = db
    .select()
    .from(pendingUploads)
    .where(and(eq(pendingUploads.channelId, channel.id), eq(pendingUploads.version, input.version)))
    .get()
  if (livePending) {
    throw new ShukkaError('conflict', `Version ${input.version} already has a pending upload`)
  }

  try {
    db.insert(pendingUploads)
      .values({
        id: uploadId,
        appId: app.id,
        channelId: channel.id,
        version: input.version,
        files: JSON.stringify(pendingFiles),
        expiresAt,
      })
      .run()
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new ShukkaError('conflict', `Version ${input.version} already has a pending upload`)
    }
    throw error
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
  options: { release?: boolean } = {},
): Promise<FinalizeResult> {
  const pending = db.select().from(pendingUploads).where(eq(pendingUploads.id, uploadId)).get()
  if (!pending) throw new ShukkaError('not_found', 'Upload not found or already finalized')
  if (pending.appId !== app.id) throw new ShukkaError('forbidden', 'Upload belongs to another app')
  if (pending.expiresAt < nowSeconds()) {
    db.delete(pendingUploads).where(eq(pendingUploads.id, uploadId)).run()
    throw new ShukkaError('conflict', 'Upload expired; start a new upload')
  }

  const channel = db.select().from(channels).where(eq(channels.id, pending.channelId)).get()
  if (!channel) throw new ShukkaError('not_found', 'Channel was deleted during upload')

  const s3 = settingsFromApp(app)
  const files = JSON.parse(pending.files) as PendingFile[]
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

  const now = nowSeconds()
  const release = options.release === true
  let created
  try {
    created = db.transaction((tx) => {
      const version = tx
        .insert(versions)
        .values({
          appId: app.id,
          channelId: channel.id,
          version: pending.version,
          createdAt: now,
          releasedAt: release ? now : null,
        })
        .returning()
        .get()

      tx.insert(artifacts)
        .values(
          verified.map((file) => ({
            versionId: version.id,
            filename: file.filename,
            s3Key: file.s3Key,
            size: file.size,
            kind: file.kind,
          })),
        )
        .run()

      if (release) {
        tx.update(channels).set({ currentVersionId: version.id }).where(eq(channels.id, channel.id)).run()
      }
      tx.delete(pendingUploads).where(eq(pendingUploads.id, uploadId)).run()
      return version
    })
  } catch (error) {
    if (isUniqueConstraint(error)) {
      throw new ShukkaError('conflict', 'Version already exists')
    }
    throw error
  }

  return {
    versionId: created.id,
    version: created.version,
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
  const version = getVersion(app.id, channelName, versionName)
  const artifact = listArtifacts(version.id).find((entry) => entry.filename === filename)
  if (!artifact) throw new ShukkaError('not_found', `${filename} not found on version ${versionName}`)
  return presignGet(settingsFromApp(app), artifact.s3Key)
}

export function listArtifacts(versionId: number) {
  return db.select().from(artifacts).where(eq(artifacts.versionId, versionId)).orderBy(artifacts.filename).all()
}

export function listArtifactsForVersions(versionIds: number[]) {
  if (versionIds.length === 0) return []
  return db
    .select()
    .from(artifacts)
    .where(inArray(artifacts.versionId, versionIds))
    .orderBy(artifacts.filename)
    .all()
}

export async function deleteVersionByName(app: App, channelName: string, version: string): Promise<void> {
  await deleteVersion(app, getVersion(app.id, channelName, version).id)
}

/** Removes a version, its stored objects, and repoints the channel if it was current. */
export async function deleteVersion(app: App, versionId: number): Promise<void> {
  const version = db
    .select()
    .from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.appId, app.id)))
    .get()
  if (!version) throw new ShukkaError('not_found', 'Version not found')

  const keys = listArtifacts(versionId).map((artifact) => artifact.s3Key)
  await deleteObjects(settingsFromApp(app), keys)

  db.transaction((tx) => {
    const channel = tx.select().from(channels).where(eq(channels.id, version.channelId)).get()
    tx.delete(versions).where(eq(versions.id, versionId)).run()

    if (channel?.currentVersionId === versionId) {
      const fallback = tx
        .select()
        .from(versions)
        .where(and(eq(versions.channelId, version.channelId), isNotNull(versions.releasedAt)))
        .orderBy(desc(versions.releasedAt))
        .get()
      tx.update(channels).set({ currentVersionId: fallback?.id ?? null }).where(eq(channels.id, channel.id)).run()
    }
  })
  clearObjectCache()
}
