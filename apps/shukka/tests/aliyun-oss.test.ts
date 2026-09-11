import { describe, expect, it } from 'vitest'
import { aliyunOssEndpoint, aliyunOssRegionId, aliyunOssSettings } from '~/lib/aliyun-oss.ts'
import { s3ObjectUrl, type S3Settings } from '~/lib/storage.ts'

describe('aliyunOssRegionId', () => {
  it('accepts the short region id', () => {
    expect(aliyunOssRegionId('cn-hangzhou')).toBe('cn-hangzhou')
  })

  it('strips a leading oss- prefix in any case', () => {
    expect(aliyunOssRegionId('oss-cn-beijing')).toBe('cn-beijing')
    expect(aliyunOssRegionId('OSS-ap-southeast-1')).toBe('ap-southeast-1')
  })

  it('trims whitespace', () => {
    expect(aliyunOssRegionId('  cn-shanghai  ')).toBe('cn-shanghai')
  })
})

describe('aliyunOssEndpoint', () => {
  it('builds the virtual-host OSS endpoint', () => {
    expect(aliyunOssEndpoint('releases', 'cn-hangzhou')).toBe(
      'https://releases.oss-cn-hangzhou.aliyuncs.com',
    )
  })

  it('does not double the oss- prefix', () => {
    expect(aliyunOssEndpoint('releases', 'oss-cn-hangzhou')).toBe(
      'https://releases.oss-cn-hangzhou.aliyuncs.com',
    )
  })
})

describe('aliyunOssSettings', () => {
  it('stores the region id and puts oss- only on the endpoint host', () => {
    expect(aliyunOssSettings('releases', 'cn-hangzhou')).toEqual({
      s3Endpoint: 'https://releases.oss-cn-hangzhou.aliyuncs.com',
      s3Region: 'cn-hangzhou',
      s3ForcePathStyle: true,
    })
  })
})

function settings(partial: Partial<S3Settings> & Pick<S3Settings, 'bucket'>): S3Settings {
  return {
    endpoint: null,
    region: 'us-east-1',
    prefix: '',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
    forcePathStyle: false,
    ...partial,
  }
}

describe('s3ObjectUrl', () => {
  it('uses path-style against a regional endpoint', () => {
    expect(
      s3ObjectUrl(
        settings({
          bucket: 'releases',
          endpoint: 'https://oss-cn-hangzhou.aliyuncs.com',
          forcePathStyle: true,
        }),
        'app/stable/1.0.0/app.zip',
      ),
    ).toBe('https://oss-cn-hangzhou.aliyuncs.com/releases/app/stable/1.0.0/app.zip')
  })

  it('does not put the bucket in the path when the host already has it', () => {
    const oss = aliyunOssSettings('releases', 'cn-hangzhou')
    expect(
      s3ObjectUrl(
        settings({
          bucket: 'releases',
          endpoint: oss.s3Endpoint,
          region: oss.s3Region,
          forcePathStyle: oss.s3ForcePathStyle,
        }),
        'app/stable/1.0.0/app.zip',
      ),
    ).toBe('https://releases.oss-cn-hangzhou.aliyuncs.com/app/stable/1.0.0/app.zip')
  })

  it('does not double the bucket host when path-style is off', () => {
    expect(
      s3ObjectUrl(
        settings({
          bucket: 'releases',
          endpoint: 'https://releases.oss-cn-hangzhou.aliyuncs.com',
          forcePathStyle: false,
        }),
        'file.bin',
      ),
    ).toBe('https://releases.oss-cn-hangzhou.aliyuncs.com/file.bin')
  })
})
