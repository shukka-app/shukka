import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { decryptSecret } from './crypto.ts'
import { ShukkaError } from './errors.ts'
import type { App } from '~/db/schema.ts'

export type S3Settings = {
  endpoint: string | null
  region: string
  bucket: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

export function settingsFromApp(app: App): S3Settings {
  return {
    endpoint: app.s3Endpoint,
    region: app.s3Region,
    bucket: app.s3Bucket,
    prefix: app.s3Prefix,
    accessKeyId: app.s3AccessKeyId,
    secretAccessKey: decryptSecret(app.s3SecretEncrypted),
    forcePathStyle: app.s3ForcePathStyle,
  }
}

function client(s3: S3Settings): S3Client {
  return new S3Client({
    region: s3.region,
    endpoint: s3.endpoint ?? undefined,
    forcePathStyle: s3.forcePathStyle,
    credentials: { accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey },
  })
}

/** Object key layout: `{prefix}/{channel}/{version}/{filename}`. */
export function objectKey(s3: S3Settings, channel: string, version: string, filename: string): string {
  const prefix = s3.prefix.replace(/^\/+|\/+$/g, '')
  return [prefix, channel, version, filename].filter(Boolean).join('/')
}

const UPLOAD_URL_TTL = 60 * 60
const DOWNLOAD_URL_TTL = 60 * 60

export function presignPut(s3: S3Settings, key: string): Promise<string> {
  return getSignedUrl(client(s3), new PutObjectCommand({ Bucket: s3.bucket, Key: key }), {
    expiresIn: UPLOAD_URL_TTL,
  })
}

export function presignGet(s3: S3Settings, key: string): Promise<string> {
  return getSignedUrl(client(s3), new GetObjectCommand({ Bucket: s3.bucket, Key: key }), {
    expiresIn: DOWNLOAD_URL_TTL,
  })
}

export function isS3NotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const named = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } }
  return (
    named.name === 'NotFound' ||
    named.name === 'NoSuchKey' ||
    named.$metadata?.httpStatusCode === 404
  )
}

export async function headObject(s3: S3Settings, key: string): Promise<{ size: number } | null> {
  try {
    const result = await client(s3).send(new HeadObjectCommand({ Bucket: s3.bucket, Key: key }))
    return { size: result.ContentLength ?? 0 }
  } catch (error) {
    if (isS3NotFound(error)) return null
    throw new ShukkaError('storage_error', 'Cannot reach storage')
  }
}

export async function getObjectText(s3: S3Settings, key: string): Promise<string> {
  try {
    const result = await client(s3).send(new GetObjectCommand({ Bucket: s3.bucket, Key: key }))
    return (await result.Body?.transformToString()) ?? ''
  } catch (error) {
    console.error(`getObjectText failed for ${key}:`, error)
    throw new ShukkaError('storage_error', 'Cannot read update metadata from storage')
  }
}

export async function deleteObjects(s3: S3Settings, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const s3Client = client(s3)
  try {
    await Promise.all(keys.map((Key) => s3Client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key }))))
  } catch {
    throw new ShukkaError('storage_error', 'Failed to delete objects from storage')
  }
}

/**
 * Write-then-delete probe used when saving app storage settings, so a bad
 * bucket or credential fails at configuration time rather than at release time.
 */
export async function verifyWritable(s3: S3Settings): Promise<void> {
  const key = objectKey(s3, '.shukka', 'probe', `${Date.now()}.txt`)
  const s3Client = client(s3)
  try {
    await s3Client.send(new PutObjectCommand({ Bucket: s3.bucket, Key: key, Body: 'shukka probe' }))
  } catch (error) {
    throw new ShukkaError('storage_error', 'Cannot write to the configured bucket', String(error))
  }
  await s3Client.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key: key })).catch(() => undefined)
}
