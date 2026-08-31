import { AwsClient } from 'aws4fetch'
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

function aws(s3: S3Settings): AwsClient {
  return new AwsClient({
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    service: 's3',
    region: s3.region,
  })
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/')
}

function parseEndpoint(endpoint: string): URL {
  return new URL(/^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`)
}

function endpointBase(s3: S3Settings): URL {
  if (s3.endpoint) return parseEndpoint(s3.endpoint)
  return new URL(`https://s3.${s3.region}.amazonaws.com`)
}

/** Public object URL (path-style or virtual-host). Exported for tests. */
export function s3ObjectUrl(s3: S3Settings, key: string): string {
  const encodedKey = encodeKey(key)
  const encodedBucket = encodeURIComponent(s3.bucket)
  if (s3.forcePathStyle) {
    const base = endpointBase(s3)
    const root = `${base.origin}${base.pathname.replace(/\/+$/, '')}`
    return `${root}/${encodedBucket}/${encodedKey}`
  }
  if (s3.endpoint) {
    const base = parseEndpoint(s3.endpoint)
    base.hostname = `${s3.bucket}.${base.hostname}`
    const root = `${base.origin}${base.pathname.replace(/\/+$/, '')}`
    return `${root}/${encodedKey}`
  }
  return `https://${encodedBucket}.s3.${s3.region}.amazonaws.com/${encodedKey}`
}

/** Object key layout: `{prefix}/{channel}/{version}/{filename}`. */
export function objectKey(s3: S3Settings, channel: string, version: string, filename: string): string {
  const prefix = s3.prefix.replace(/^\/+|\/+$/g, '')
  return [prefix, channel, version, filename].filter(Boolean).join('/')
}

const UPLOAD_URL_TTL = 60 * 60
const DOWNLOAD_URL_TTL = 60 * 60

async function presign(s3: S3Settings, key: string, method: string, expiresIn: number): Promise<string> {
  const url = new URL(s3ObjectUrl(s3, key))
  url.searchParams.set('X-Amz-Expires', String(expiresIn))
  const signed = await aws(s3).sign(url, { method, aws: { signQuery: true } })
  return signed.url
}

export function presignPut(s3: S3Settings, key: string): Promise<string> {
  return presign(s3, key, 'PUT', UPLOAD_URL_TTL)
}

export function presignGet(s3: S3Settings, key: string): Promise<string> {
  return presign(s3, key, 'GET', DOWNLOAD_URL_TTL)
}

export function isS3NotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if (error instanceof Response) return error.status === 404
  const named = error as { name?: unknown; $metadata?: { httpStatusCode?: unknown }; status?: unknown }
  return (
    named.name === 'NotFound' ||
    named.name === 'NoSuchKey' ||
    named.$metadata?.httpStatusCode === 404 ||
    named.status === 404
  )
}

async function signedFetch(s3: S3Settings, key: string, init?: RequestInit): Promise<Response> {
  return aws(s3).fetch(s3ObjectUrl(s3, key), init)
}

export async function headObject(s3: S3Settings, key: string): Promise<{ size: number } | null> {
  try {
    const result = await signedFetch(s3, key, { method: 'HEAD' })
    if (result.status === 404) return null
    if (!result.ok) throw new ShukkaError('storage_error', 'Cannot reach storage')
    return { size: Number(result.headers.get('content-length') ?? 0) }
  } catch (error) {
    if (error instanceof ShukkaError) throw error
    if (isS3NotFound(error)) return null
    throw new ShukkaError('storage_error', 'Cannot reach storage')
  }
}

export async function getObjectText(s3: S3Settings, key: string): Promise<string> {
  try {
    const result = await signedFetch(s3, key)
    if (!result.ok) throw new Error(`getObjectText ${result.status}`)
    return await result.text()
  } catch (error) {
    console.error(`getObjectText failed for ${key}:`, error)
    throw new ShukkaError('storage_error', 'Cannot read update metadata from storage')
  }
}

export async function deleteObjects(s3: S3Settings, keys: string[]): Promise<void> {
  if (keys.length === 0) return
  try {
    await Promise.all(
      keys.map(async (key) => {
        const result = await signedFetch(s3, key, { method: 'DELETE' })
        if (!result.ok && result.status !== 404) throw new Error(`delete ${result.status}`)
      }),
    )
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
  try {
    const result = await signedFetch(s3, key, { method: 'PUT', body: 'shukka probe' })
    if (!result.ok) throw new Error(`probe put ${result.status}`)
  } catch (error) {
    throw new ShukkaError('storage_error', 'Cannot write to the configured bucket', String(error))
  }
  await signedFetch(s3, key, { method: 'DELETE' }).catch(() => undefined)
}
