import { z } from 'zod'

export type ReleaseMetadata = Record<string, z.infer<ReturnType<typeof z.json>>>
export type ReleaseMetadataResponse = { version: string; metadata: ReleaseMetadata }

/** Validate without cloning: record parsers discard user-defined __proto__ keys. */
export const releaseMetadataSchema = z.unknown().superRefine((value, ctx) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    ctx.addIssue({ code: 'custom', message: 'Release metadata must be a JSON object' })
    return
  }
  try {
    const json = JSON.stringify(value, (_key, item: unknown) => {
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol' ||
          typeof item === 'bigint' || (typeof item === 'number' && !Number.isFinite(item))) {
        throw new Error('Not a JSON value')
      }
      return item
    })
    if (new TextEncoder().encode(json).byteLength > 16 * 1024) {
      ctx.addIssue({ code: 'custom', message: 'Release metadata must not exceed 16 KiB of UTF-8 JSON' })
    }
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Release metadata must contain only JSON values' })
  }
}).meta({
  type: 'object',
  additionalProperties: true,
  description: 'Custom JSON object; at most 16 KiB of compact UTF-8 JSON. Public after release.',
}) as z.ZodType<ReleaseMetadata>
