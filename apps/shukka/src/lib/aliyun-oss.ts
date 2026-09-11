/**
 * Aliyun OSS S3-compatible endpoint. Users enter a region id like
 * `cn-hangzhou`; we hide the `oss-` prefix on the constructed host.
 */
export function aliyunOssRegionId(region: string): string {
  return region.trim().replace(/^oss-/i, '')
}

export function aliyunOssEndpoint(bucket: string, region: string): string {
  return `https://${bucket.trim()}.oss-${aliyunOssRegionId(region)}.aliyuncs.com`
}

/** Wizard mapping: virtual-host endpoint + path-style (not user-configurable). */
export function aliyunOssSettings(bucket: string, region: string): {
  s3Endpoint: string
  s3Region: string
  s3ForcePathStyle: true
} {
  const regionId = aliyunOssRegionId(region)
  return {
    s3Endpoint: aliyunOssEndpoint(bucket, region),
    s3Region: regionId,
    s3ForcePathStyle: true,
  }
}
