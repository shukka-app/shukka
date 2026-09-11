import { parse } from 'yaml'
import { ShukkaError } from './errors.ts'

/**
 * electron-updater metadata files: `latest.yml`, `latest-mac.yml`, `latest-linux.yml`,
 * and the `{channel}.yml` variants produced for custom channels. Shukka only reads
 * them — content is served back byte-for-byte (ADR: update-feed-proxy).
 */
export function isMetadataFile(filename: string): boolean {
  return /\.ya?ml$/i.test(filename)
}

export type UpdateMetadata = {
  version: string
  files: { url: string; sha512?: string; size?: number }[]
}

export function parseUpdateMetadata(filename: string, text: string): UpdateMetadata {
  let parsed: unknown
  try {
    parsed = parse(text)
  } catch (error) {
    throw new ShukkaError('metadata_error', `${filename} is not valid YAML`, String(error))
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ShukkaError('metadata_error', `${filename} is not an update metadata document`)
  }

  const record = parsed as Record<string, unknown>
  const version = record.version
  if (typeof version !== 'string' || !version) {
    throw new ShukkaError('metadata_error', `${filename} has no "version" field`)
  }

  const rawFiles = Array.isArray(record.files) ? record.files : []
  const files = rawFiles.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const file = entry as Record<string, unknown>
    return typeof file.url === 'string'
      ? [
          {
            url: file.url,
            sha512: typeof file.sha512 === 'string' ? file.sha512 : undefined,
            size: typeof file.size === 'number' ? file.size : undefined,
          },
        ]
      : []
  })

  return { version, files }
}

/** electron-updater resolves `files[].url` relative to the feed base URL. */
export function referencedArtifacts(metadata: UpdateMetadata): string[] {
  return metadata.files.map((file) => decodeURIComponent(file.url.split('/').pop() ?? file.url))
}
