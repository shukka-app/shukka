/**
 * Zod contract for the documented App API. Routes validate with these
 * schemas; `openapi.ts` turns them into JSON Schema via `z.toJSONSchema`.
 */
import { z } from 'zod'
import { UPDATER_KINDS } from '~/lib/updater-kind.ts'

const unixSeconds = z.number().int()

export const errorSchema = z.object({
  error: z.enum([
    'unauthorized',
    'forbidden',
    'not_found',
    'conflict',
    'invalid_request',
    'storage_error',
    'metadata_error',
    'rate_limited',
  ]),
  message: z.string(),
  details: z.any().optional(),
})

export const appInputSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  s3Endpoint: z.string().trim().min(1).nullable().default(null),
  s3Region: z.string().min(1),
  s3Bucket: z.string().min(1),
  s3Prefix: z.string().default(''),
  s3AccessKeyId: z.string().min(1),
  s3SecretAccessKey: z.string().min(1).optional(),
  s3ForcePathStyle: z.boolean().default(false),
  updaterKind: z.enum(UPDATER_KINDS).optional(),
})

export const createChannelBodySchema = z.object({ name: z.string().min(1) })

export const setCurrentVersionBodySchema = z.object({
  currentVersion: z
    .string()
    .min(1)
    .nullable()
    .meta({ description: 'Version string, or null to clear current' }),
})

export const upsertNoteBodySchema = z.object({ markdown: z.string().min(1) })

export const notesConfigSchema = z.object({
  enabled: z.boolean(),
  locales: z.array(z.string().min(1)),
  fallbackLocale: z.string().min(1),
})

export const uploadInitBodySchema = z.object({
  app: z.string().optional(),
  channel: z.string().min(1),
  version: z.string().min(1),
  createChannel: z.boolean().optional(),
  files: z
    .array(z.object({ filename: z.string().min(1), size: z.number().int().nonnegative().optional() }))
    .min(1),
})

export const uploadFinalizeBodySchema = z.object({
  uploadId: z.string().min(1),
  app: z.string().optional(),
  release: z.boolean().optional(),
})

export const publicAppSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  s3Endpoint: z.string().nullable(),
  s3Region: z.string(),
  s3Bucket: z.string(),
  s3Prefix: z.string(),
  s3AccessKeyId: z.string(),
  s3ForcePathStyle: z.boolean(),
  releaseLogEnabled: z.boolean(),
  releaseLogLocales: z.array(z.string()),
  releaseLogFallbackLocale: z.string(),
  updaterKind: z.enum(UPDATER_KINDS),
  createdAt: unixSeconds,
})

export const apiKeyPublicSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  hint: z.string(),
  createdAt: unixSeconds,
  lastUsedAt: unixSeconds.nullable(),
  revokedAt: unixSeconds.nullable(),
})

export const artifactSchema = z.object({
  id: z.number().int(),
  versionId: z.number().int(),
  filename: z.string(),
  s3Key: z.string(),
  size: z.number().int(),
  kind: z.enum(['metadata', 'artifact']),
})

export const versionDetailSchema = z.object({
  id: z.number().int(),
  appId: z.number().int(),
  channelId: z.number().int(),
  version: z.string(),
  createdAt: unixSeconds,
  releasedAt: unixSeconds.nullable(),
  metadataHits: z.number().int(),
  artifactHits: z.number().int(),
  isDraft: z.boolean(),
  isCurrent: z.boolean(),
  artifacts: z.array(artifactSchema),
})

export const channelDetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  currentVersionId: z.number().int().nullable(),
  feedUrl: z.string(),
  versions: z.array(versionDetailSchema),
})

export const appDetailResponseSchema = z.object({
  app: publicAppSchema,
  channels: z.array(channelDetailSchema),
  keys: z
    .array(apiKeyPublicSchema)
    .optional()
    .meta({ description: 'Present only for session actors; omitted when authenticated with an API key.' }),
})

export const appUpdateResponseSchema = z.object({ app: publicAppSchema })

export const channelRowSchema = z.object({
  id: z.number().int(),
  appId: z.number().int(),
  name: z.string(),
  currentVersionId: z.number().int().nullable(),
  createdAt: unixSeconds,
})

export const channelListResponseSchema = z.object({ channels: z.array(channelRowSchema) })
export const channelCreateResponseSchema = z.object({ channel: channelRowSchema })
export const okResponseSchema = z.object({ ok: z.literal(true) })

export const trendPointSchema = z.object({
  t: unixSeconds,
  metadata: z.number().int(),
  artifact: z.number().int(),
})

export const channelTrendResponseSchema = z.object({
  granularity: z.enum(['hour', 'day']),
  points: z.array(trendPointSchema),
})

export const versionTrendResponseSchema = z.object({ points: z.array(trendPointSchema) })

export const noteContentSchema = z.object({
  locale: z.string(),
  markdown: z.string(),
  html: z.string(),
  text: z.string(),
})

export const noteRowSchema = noteContentSchema.extend({
  id: z.number().int(),
  versionId: z.number().int(),
})

export const editorNotesResponseSchema = z.object({ notes: z.array(noteRowSchema) })
export const savedNoteResponseSchema = z.object({ note: noteRowSchema })

export const publicNotesResponseSchema = z.object({
  notes: z.array(
    noteContentSchema.extend({
      version: z.string(),
      releasedAt: unixSeconds,
    }),
  ),
})

export const notesConfigResponseSchema = z.object({ releaseLog: notesConfigSchema })

export const uploadInitResponseSchema = z.object({
  uploadId: z.string(),
  expiresAt: unixSeconds,
  files: z.array(z.object({ filename: z.string(), key: z.string(), uploadUrl: z.string() })),
})

export const uploadFinalizeResponseSchema = z.object({
  versionId: z.number().int(),
  version: z.string(),
  channel: z.string(),
  artifacts: z.array(
    z.object({
      filename: z.string(),
      size: z.number().int(),
      kind: z.enum(['metadata', 'artifact']),
    }),
  ),
})

export const tauriFeedSchema = z.object({
  version: z.string(),
  pub_date: z.string(),
  platforms: z.record(z.string(), z.object({ url: z.string(), signature: z.string() })),
})
