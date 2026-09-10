import { ShukkaError, safeDecodeURIComponent } from './errors.ts'

/**
 * Last path segment of an artifact reference (absolute URL or bare filename),
 * percent-decoded. Malformed encoding is a metadata error, never a URIError.
 */
export function urlBasename(reference: string): string {
  let segment: string
  try {
    segment = new URL(reference).pathname.split('/').pop() ?? reference
  } catch {
    segment = reference.split('/').pop() ?? reference
  }
  const decoded = safeDecodeURIComponent(segment)
  if (decoded === null) {
    throw new ShukkaError('metadata_error', `Artifact reference is not valid percent-encoding: "${reference}"`)
  }
  return decoded
}
