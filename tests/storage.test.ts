import { describe, expect, it } from 'vitest'
import { isS3NotFound, objectKey, presignGet, presignPut, s3ObjectUrl, type S3Settings } from '~/lib/storage.ts'

function settings(overrides: Partial<S3Settings> = {}): S3Settings {
  return {
    endpoint: null,
    region: 'us-east-1',
    bucket: 'releases',
    prefix: 'acme',
    accessKeyId: 'AKIAEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    forcePathStyle: false,
    ...overrides,
  }
}

describe('s3 object URLs', () => {
  it('uses regional virtual-host when there is no custom endpoint', () => {
    expect(s3ObjectUrl(settings(), 'acme/stable/1.0.0/latest.yml')).toBe(
      'https://releases.s3.us-east-1.amazonaws.com/acme/stable/1.0.0/latest.yml',
    )
  })

  it('uses path-style on a custom endpoint (MinIO / JuiceFS / R2)', () => {
    expect(
      s3ObjectUrl(
        settings({ endpoint: 'http://minio:9000', forcePathStyle: true }),
        'acme/stable/1.0.0/latest.yml',
      ),
    ).toBe('http://minio:9000/releases/acme/stable/1.0.0/latest.yml')
  })

  it('uses virtual-host on a custom endpoint when path-style is off', () => {
    expect(
      s3ObjectUrl(settings({ endpoint: 'https://s3.example.com', forcePathStyle: false }), 'key'),
    ).toBe('https://releases.s3.example.com/key')
  })

  it('encodes key segments but keeps slashes', () => {
    expect(s3ObjectUrl(settings(), 'a b/c+d')).toBe(
      'https://releases.s3.us-east-1.amazonaws.com/a%20b/c%2Bd',
    )
  })
})

describe('objectKey', () => {
  it('joins prefix / channel / version / filename', () => {
    expect(objectKey(settings({ prefix: '/acme/' }), 'stable', '1.0.0', 'latest.yml')).toBe(
      'acme/stable/1.0.0/latest.yml',
    )
  })
})

describe('presign', () => {
  it('signs PUT and GET query strings for 1 hour with UNSIGNED-PAYLOAD', async () => {
    const s3 = settings({ endpoint: 'http://minio:9000', forcePathStyle: true })
    const put = new URL(await presignPut(s3, 'acme/file.bin'))
    const get = new URL(await presignGet(s3, 'acme/file.bin'))

    expect(put.origin + put.pathname).toBe('http://minio:9000/releases/acme/file.bin')
    expect(put.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(put.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256')
    expect(put.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(put.searchParams.get('X-Amz-SignedHeaders')).toBe('host')

    expect(get.searchParams.get('X-Amz-Expires')).toBe('3600')
    expect(get.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/)
    expect(get.searchParams.get('X-Amz-Signature')).not.toBe(put.searchParams.get('X-Amz-Signature'))
  })
})

describe('isS3NotFound', () => {
  it('accepts AWS SDK shapes and HTTP 404', () => {
    expect(isS3NotFound({ name: 'NotFound' })).toBe(true)
    expect(isS3NotFound({ name: 'NoSuchKey' })).toBe(true)
    expect(isS3NotFound({ $metadata: { httpStatusCode: 404 } })).toBe(true)
    expect(isS3NotFound({ status: 404 })).toBe(true)
    expect(isS3NotFound(new Response(null, { status: 404 }))).toBe(true)
    expect(isS3NotFound({ name: 'TimeoutError' })).toBe(false)
    expect(isS3NotFound({ $metadata: { httpStatusCode: 403 } })).toBe(false)
    expect(isS3NotFound(new Error('network'))).toBe(false)
  })
})
