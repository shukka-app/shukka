/**
 * OpenAPI 3 document for the operations an API key (or panel session) can
 * call: the programmatic App API under `/api/v1/apps/{slug}`, the upload
 * protocol, and the public no-auth feed and notes. Session-only admin
 * operations (delete app, API key lifecycle, instance-level routes) are
 * intentionally omitted (ADR: app-api-v1).
 *
 * Request and response schemas come from Zod via `z.toJSONSchema`.
 */
import { z } from 'zod'
import {
  appDetailResponseSchema,
  appInputSchema,
  appUpdateResponseSchema,
  channelCreateResponseSchema,
  channelListResponseSchema,
  channelTrendResponseSchema,
  createChannelBodySchema,
  editorNotesResponseSchema,
  errorSchema,
  notesConfigResponseSchema,
  notesConfigSchema,
  okResponseSchema,
  publicNotesResponseSchema,
  savedNoteResponseSchema,
  setCurrentVersionBodySchema,
  tauriFeedSchema,
  uploadFinalizeBodySchema,
  uploadFinalizeResponseSchema,
  uploadInitBodySchema,
  uploadInitResponseSchema,
  upsertNoteBodySchema,
  versionTrendResponseSchema,
} from './api-schemas.ts'

type JsonSchema = Record<string, unknown>

function stripSafeIntBounds(value: unknown): void {
  if (!value || typeof value !== 'object') return
  const rec = value as Record<string, unknown>
  if (rec.type === 'integer' && rec.minimum === Number.MIN_SAFE_INTEGER && rec.maximum === Number.MAX_SAFE_INTEGER) {
    delete rec.minimum
    delete rec.maximum
  }
  for (const nested of Object.values(rec)) {
    if (Array.isArray(nested)) nested.forEach(stripSafeIntBounds)
    else stripSafeIntBounds(nested)
  }
}

function jsonSchema(schema: z.ZodType, io: 'input' | 'output' = 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io }) as JsonSchema
  delete json.$schema
  stripSafeIntBounds(json)
  return json
}

function jsonContent(schema: z.ZodType, io: 'input' | 'output' = 'output') {
  return { 'application/json': { schema: jsonSchema(schema, io) } }
}

function jsonResponse(description: string, schema: z.ZodType) {
  return { description, content: jsonContent(schema) }
}

function jsonBody(schema: z.ZodType) {
  return { required: true, content: jsonContent(schema, 'input') }
}

const errorContent = jsonContent(errorSchema)
const notFound = { description: 'Missing or draft', content: errorContent }
const artifactMissing = { description: 'Missing version or file', content: errorContent }

export function openApiDocument(origin: string) {
  const server = origin.replace(/\/+$/, '')
  return {
    openapi: '3.1.0',
    info: {
      title: 'Shukka API',
      version: '1.0.0',
      description:
        'Operations an API key (or panel session) can call under `/api/v1/apps/{appSlug}`, the upload protocol, and the public no-auth feed. Session-only admin operations (delete the app, API key lifecycle, instance-level routes under `/api/admin`) are not documented here.',
    },
    servers: [{ url: server }],
    tags: [
      { name: 'App', description: 'Read and update one app.' },
      { name: 'Channels', description: 'Channels and current-version promote / rollback.' },
      { name: 'Versions', description: 'Delete a version; read its notes and trend; download an artifact.' },
      { name: 'Notes', description: 'Per-version release notes (editor) and public read.' },
      { name: 'Upload', description: 'Presigned direct upload; defaults to draft.' },
      { name: 'Feed', description: 'Public update feed (Electron yml or Tauri JSON) — no auth.' },
    ],
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'shk_' },
        session: { type: 'apiKey', in: 'cookie', name: 'shukka_session' },
      },
      schemas: {
        Error: jsonSchema(errorSchema),
      },
    },
    security: [{ apiKey: [] }, { session: [] }],
    paths: {
      '/api/v1/apps/{appSlug}': {
        get: {
          tags: ['App'],
          summary: 'App detail (channels, versions, keys)',
          parameters: [slugParam],
          responses: { '200': jsonResponse('App detail', appDetailResponseSchema) },
        },
        patch: {
          tags: ['App'],
          summary: 'Update app settings (probes S3)',
          description:
            'API keys may only change `name`. Slug and storage fields are session-only; resubmitting unchanged values is allowed. Changing endpoint/bucket/prefix with existing artifacts probes the newest object at the new location.',
          parameters: [slugParam],
          requestBody: jsonBody(appInputSchema),
          responses: { '200': jsonResponse('Updated app', appUpdateResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels': {
        get: {
          tags: ['Channels'],
          summary: 'List channels',
          parameters: [slugParam],
          responses: { '200': jsonResponse('Channel list', channelListResponseSchema) },
        },
        post: {
          tags: ['Channels'],
          summary: 'Create a channel',
          parameters: [slugParam],
          requestBody: jsonBody(createChannelBodySchema),
          responses: { '201': jsonResponse('Created', channelCreateResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}': {
        patch: {
          tags: ['Channels'],
          summary: 'Set currentVersion (promote draft or rollback)',
          parameters: [slugParam, channelParam],
          requestBody: jsonBody(setCurrentVersionBodySchema),
          responses: { '200': jsonResponse('Updated', okResponseSchema) },
        },
        delete: {
          tags: ['Channels'],
          summary: 'Delete a channel and its objects',
          parameters: [slugParam, channelParam],
          responses: { '200': jsonResponse('Deleted', okResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/trend': {
        get: {
          tags: ['Channels'],
          summary: 'Channel hit trend',
          parameters: [slugParam, channelParam, { name: 'range', in: 'query', schema: { type: 'integer', enum: [7, 30, 90] } }],
          responses: { '200': jsonResponse('Trend series', channelTrendResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}': {
        delete: {
          tags: ['Versions'],
          summary: 'Delete a version and its objects',
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse('Deleted', okResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/artifacts/{filename}': {
        get: {
          tags: ['Versions'],
          summary: 'Presigned GET for one artifact on that version (drafts included). Does not increment hits.',
          parameters: [
            slugParam,
            channelParam,
            versionParam,
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '302': { description: 'Redirect to storage' },
            '404': artifactMissing,
          },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend': {
        get: {
          tags: ['Versions'],
          summary: 'Version hit trend (empty for drafts)',
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse('Trend series', versionTrendResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes': {
        get: {
          tags: ['Notes'],
          summary: 'Editor read model — every locale for one version',
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse('Notes', editorNotesResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes/{locale}': {
        put: {
          tags: ['Notes'],
          summary: 'Upsert a locale note',
          parameters: [slugParam, channelParam, versionParam, localeParam],
          requestBody: jsonBody(upsertNoteBodySchema),
          responses: { '200': jsonResponse('Saved note', savedNoteResponseSchema) },
        },
        delete: {
          tags: ['Notes'],
          summary: 'Delete a locale note',
          parameters: [slugParam, channelParam, versionParam, localeParam],
          responses: { '200': jsonResponse('Deleted', okResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/notes': {
        get: {
          tags: ['Notes'],
          summary: 'Public notes — released versions only, no auth',
          security: [],
          parameters: [
            slugParam,
            channelParam,
            { name: 'from', in: 'query', schema: { type: 'string' } },
            { name: 'to', in: 'query', schema: { type: 'string' } },
            { name: 'locale', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': jsonResponse('Public notes', publicNotesResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/notes-config': {
        put: {
          tags: ['Notes'],
          summary: 'Save release-log config (no S3 probe)',
          parameters: [slugParam],
          requestBody: jsonBody(notesConfigSchema),
          responses: { '200': jsonResponse('Saved config', notesConfigResponseSchema) },
        },
      },
      '/api/v1/upload/init': {
        post: {
          tags: ['Upload'],
          summary:
            'Start a pending upload. Electron requires at least one `.yml`; Tauri requires `latest.json` and/or artifact+`.sig` pairs; Sparkle requires `appcast.xml` and/or archive+`.sig` (see spec).',
          security: [{ apiKey: [] }],
          requestBody: jsonBody(uploadInitBodySchema),
          responses: { '200': jsonResponse('uploadId and presigned PUT URLs', uploadInitResponseSchema) },
        },
      },
      '/api/v1/upload/finalize': {
        post: {
          tags: ['Upload'],
          summary: 'Create a version. Default is draft; `release: true` goes live.',
          security: [{ apiKey: [] }],
          requestBody: jsonBody(uploadFinalizeBodySchema),
          responses: { '200': jsonResponse('Version created', uploadFinalizeResponseSchema) },
        },
      },
      '/api/update/{appSlug}/{channel}': {
        get: {
          tags: ['Feed'],
          summary: 'Channel-root feed. Tauri returns JSON; Sparkle returns a one-item appcast.',
          security: [],
          parameters: [slugParam, channelParam],
          responses: {
            '200': feedDocumentResponse,
            '404': notFound,
          },
        },
      },
      '/api/update/{appSlug}/{channel}/{filename}': {
        get: {
          tags: ['Feed'],
          summary: 'Public feed — Electron yml / Tauri latest.json / Sparkle appcast, artifacts 302. Drafts are 404.',
          security: [],
          parameters: [slugParam, channelParam, { name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': feedDocumentResponse,
            '302': { description: 'Artifact redirect' },
            '404': notFound,
          },
        },
      },
    },
  }
}

const feedDocumentResponse = {
  description: 'Generated feed document',
  content: {
    'application/json': { schema: jsonSchema(tauriFeedSchema) },
    'text/yaml': { schema: { type: 'string' } },
    'application/xml': { schema: { type: 'string' } },
  },
}

const slugParam = { name: 'appSlug', in: 'path' as const, required: true, schema: { type: 'string' } }
const channelParam = { name: 'channel', in: 'path' as const, required: true, schema: { type: 'string' } }
const versionParam = { name: 'version', in: 'path' as const, required: true, schema: { type: 'string' } }
const localeParam = { name: 'locale', in: 'path' as const, required: true, schema: { type: 'string' } }
