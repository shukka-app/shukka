/**
 * OpenAPI 3 document for the operations an API key (or panel session) can
 * call: the programmatic App API under `/api/v1/apps/{slug}`, the upload
 * protocol, and the public no-auth feed and notes. Session-only admin
 * operations (delete app, API key lifecycle, instance-level routes) are
 * intentionally omitted (ADR: app-api-v1).
 *
 * Request and response schemas come from Zod via `z.toJSONSchema`.
 * Narrative copy is locale-parameterized (ADR: openapi-locale).
 */
import { z } from 'zod'
import {
  releaseMetadataBodySchema,
  releaseMetadataResponseSchema,
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
import { openApiCopy, type OpenApiCopy, type OpenApiLocale } from './openapi-copy.ts'

export type { OpenApiLocale }

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

/**
 * Named schemas. Generated SDKs take their model names from these keys, so the
 * names are public API: prefer the noun a caller sees, not the route that
 * returns it (ADR: openapi-component-schemas).
 *
 * Request bodies use `*Request`, responses use the noun they return.
 */
const schemas = {
  Error: jsonSchema(errorSchema),

  AppDetail: jsonSchema(appDetailResponseSchema),
  AppUpdated: jsonSchema(appUpdateResponseSchema),
  AppUpdateRequest: jsonSchema(appInputSchema, 'input'),

  ChannelList: jsonSchema(channelListResponseSchema),
  ChannelCreated: jsonSchema(channelCreateResponseSchema),
  CreateChannelRequest: jsonSchema(createChannelBodySchema, 'input'),
  SetCurrentVersionRequest: jsonSchema(setCurrentVersionBodySchema, 'input'),
  ChannelTrend: jsonSchema(channelTrendResponseSchema),

  VersionTrend: jsonSchema(versionTrendResponseSchema),

  EditorNotes: jsonSchema(editorNotesResponseSchema),
  PublicNotes: jsonSchema(publicNotesResponseSchema),
  SavedNote: jsonSchema(savedNoteResponseSchema),
  UpsertNoteRequest: jsonSchema(upsertNoteBodySchema, 'input'),
  NotesConfigResponse: jsonSchema(notesConfigResponseSchema),
  SaveNotesConfigRequest: jsonSchema(notesConfigSchema, 'input'),

  ReleaseMetadata: jsonSchema(releaseMetadataResponseSchema),
  ReplaceReleaseMetadataRequest: jsonSchema(releaseMetadataBodySchema, 'input'),

  UploadInitResponse: jsonSchema(uploadInitResponseSchema),
  InitUploadRequest: jsonSchema(uploadInitBodySchema, 'input'),
  UploadFinalizeResponse: jsonSchema(uploadFinalizeResponseSchema),
  FinalizeUploadRequest: jsonSchema(uploadFinalizeBodySchema, 'input'),

  OkResponse: jsonSchema(okResponseSchema),

  TauriFeed: jsonSchema(tauriFeedSchema),
} as const

type SchemaName = keyof typeof schemas

/** Reference into `components.schemas`; a typo is a compile error. */
function ref(name: SchemaName) {
  return { $ref: `#/components/schemas/${name}` }
}

function jsonContent(schema: JsonSchema) {
  return { 'application/json': { schema } }
}

function jsonResponse(description: string, schema: JsonSchema) {
  return { description, content: jsonContent(schema) }
}

function jsonBody(schema: JsonSchema) {
  return { required: true, content: jsonContent(schema) }
}

function opNarrative(op: { summary: string; description?: string }) {
  return op.description ? { summary: op.summary, description: op.description } : { summary: op.summary }
}

/**
 * One documented operation. The `ops` key doubles as the public `operationId`:
 * adding a path without naming it, or naming it without updating every locale,
 * fails to compile. Renaming an id breaks every generated SDK, so ids are a
 * contract (ADR: openapi-operation-ids).
 */
function operation(copy: OpenApiCopy, id: keyof OpenApiCopy['ops']) {
  return { operationId: id, ...opNarrative(copy.ops[id]) }
}

export function openApiDocument(origin: string, locale: OpenApiLocale = 'en') {
  const t = openApiCopy(locale)
  const server = origin.replace(/\/+$/, '')
  const errorContent = jsonContent(ref('Error'))
  const notFound = { description: t.responses.notFound, content: errorContent }
  const artifactMissing = { description: t.responses.artifactMissing, content: errorContent }
  const feedDocumentResponse = {
    description: t.responses.feedDocument,
    content: {
      'application/json': { schema: ref('TauriFeed') },
      'text/yaml': { schema: { type: 'string' } },
      'application/xml': { schema: { type: 'string' } },
    },
  }

  return {
    openapi: '3.1.0',
    info: {
      title: t.info.title,
      version: '1.0.0',
      description: t.info.description,
    },
    servers: [{ url: server }],
    tags: [
      { name: t.tags.app.name, description: t.tags.app.description },
      { name: t.tags.channels.name, description: t.tags.channels.description },
      { name: t.tags.versions.name, description: t.tags.versions.description },
      { name: t.tags.notes.name, description: t.tags.notes.description },
      { name: t.tags.upload.name, description: t.tags.upload.description },
      { name: t.tags.feed.name, description: t.tags.feed.description },
    ],
    components: {
      securitySchemes: {
        apiKey: { type: 'http', scheme: 'bearer', bearerFormat: 'shk_' },
        session: { type: 'apiKey', in: 'cookie', name: 'shukka_session' },
      },
      schemas,
    },
    security: [{ apiKey: [] }, { session: [] }],
    paths: {
      '/api/v1/apps/{appSlug}': {
        get: {
          tags: [t.tags.app.name],
          ...operation(t, 'getApp'),
          parameters: [slugParam],
          responses: { '200': jsonResponse(t.responses.appDetail, ref('AppDetail')) },
        },
        patch: {
          tags: [t.tags.app.name],
          ...operation(t, 'updateApp'),
          parameters: [slugParam],
          requestBody: jsonBody(ref('AppUpdateRequest')),
          responses: { '200': jsonResponse(t.responses.updatedApp, ref('AppUpdated')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels': {
        get: {
          tags: [t.tags.channels.name],
          ...operation(t, 'listChannels'),
          parameters: [slugParam],
          responses: { '200': jsonResponse(t.responses.channelList, ref('ChannelList')) },
        },
        post: {
          tags: [t.tags.channels.name],
          ...operation(t, 'createChannel'),
          parameters: [slugParam],
          requestBody: jsonBody(ref('CreateChannelRequest')),
          responses: { '201': jsonResponse(t.responses.created, ref('ChannelCreated')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}': {
        patch: {
          tags: [t.tags.channels.name],
          ...operation(t, 'setCurrentVersion'),
          parameters: [slugParam, channelParam],
          requestBody: jsonBody(ref('SetCurrentVersionRequest')),
          responses: { '200': jsonResponse(t.responses.updated, ref('OkResponse')) },
        },
        delete: {
          tags: [t.tags.channels.name],
          ...operation(t, 'deleteChannel'),
          parameters: [slugParam, channelParam],
          responses: { '200': jsonResponse(t.responses.deleted, ref('OkResponse')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/trend': {
        get: {
          tags: [t.tags.channels.name],
          ...operation(t, 'getChannelTrend'),
          parameters: [slugParam, channelParam, { name: 'range', in: 'query', schema: { type: 'integer', enum: [7, 30, 90] } }],
          responses: { '200': jsonResponse(t.responses.trendSeries, ref('ChannelTrend')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}': {
        delete: {
          tags: [t.tags.versions.name],
          ...operation(t, 'deleteVersion'),
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse(t.responses.deleted, ref('OkResponse')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/artifacts/{filename}': {
        get: {
          tags: [t.tags.versions.name],
          ...operation(t, 'getArtifact'),
          parameters: [
            slugParam,
            channelParam,
            versionParam,
            { name: 'filename', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            '302': { description: t.responses.redirectToStorage },
            '404': artifactMissing,
          },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/metadata': {
        get: {
          tags: [t.tags.versions.name],
          ...operation(t, 'getReleaseMetadata'),
          security: [{}, { apiKey: [] }, { session: [] }],
          parameters: [slugParam, channelParam, versionParam],
          responses: {
            '200': jsonResponse(t.responses.releaseMetadata, ref('ReleaseMetadata')),
            '404': notFound,
          },
        },
        put: {
          tags: [t.tags.versions.name],
          ...operation(t, 'replaceReleaseMetadata'),
          parameters: [slugParam, channelParam, versionParam],
          requestBody: jsonBody(ref('ReplaceReleaseMetadataRequest')),
          responses: { '200': jsonResponse(t.responses.releaseMetadata, ref('ReleaseMetadata')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend': {
        get: {
          tags: [t.tags.versions.name],
          ...operation(t, 'getVersionTrend'),
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse(t.responses.trendSeries, ref('VersionTrend')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes': {
        get: {
          tags: [t.tags.notes.name],
          ...operation(t, 'getEditorNotes'),
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse(t.responses.notes, ref('EditorNotes')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes/{locale}': {
        put: {
          tags: [t.tags.notes.name],
          ...operation(t, 'upsertNote'),
          parameters: [slugParam, channelParam, versionParam, localeParam],
          requestBody: jsonBody(ref('UpsertNoteRequest')),
          responses: { '200': jsonResponse(t.responses.savedNote, ref('SavedNote')) },
        },
        delete: {
          tags: [t.tags.notes.name],
          ...operation(t, 'deleteNote'),
          parameters: [slugParam, channelParam, versionParam, localeParam],
          responses: { '200': jsonResponse(t.responses.deleted, ref('OkResponse')) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/notes': {
        get: {
          tags: [t.tags.notes.name],
          ...operation(t, 'listPublicNotes'),
          security: [],
          parameters: [
            slugParam,
            channelParam,
            { name: 'from', in: 'query', schema: { type: 'string' } },
            { name: 'to', in: 'query', schema: { type: 'string' } },
            { name: 'locale', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': jsonResponse(t.responses.publicNotes, ref('PublicNotes')) },
        },
      },
      '/api/v1/apps/{appSlug}/notes-config': {
        put: {
          tags: [t.tags.notes.name],
          ...operation(t, 'saveNotesConfig'),
          parameters: [slugParam],
          requestBody: jsonBody(ref('SaveNotesConfigRequest')),
          responses: { '200': jsonResponse(t.responses.savedConfig, ref('NotesConfigResponse')) },
        },
      },
      '/api/v1/upload/init': {
        post: {
          tags: [t.tags.upload.name],
          ...operation(t, 'initUpload'),
          security: [{ apiKey: [] }],
          requestBody: jsonBody(ref('InitUploadRequest')),
          responses: { '200': jsonResponse(t.responses.uploadInit, ref('UploadInitResponse')) },
        },
      },
      '/api/v1/upload/finalize': {
        post: {
          tags: [t.tags.upload.name],
          ...operation(t, 'finalizeUpload'),
          security: [{ apiKey: [] }],
          requestBody: jsonBody(ref('FinalizeUploadRequest')),
          responses: { '200': jsonResponse(t.responses.versionCreated, ref('UploadFinalizeResponse')) },
        },
      },
      '/api/update/{appSlug}/{channel}': {
        get: {
          tags: [t.tags.feed.name],
          ...operation(t, 'getChannelFeed'),
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
          tags: [t.tags.feed.name],
          ...operation(t, 'getFeedFile'),
          security: [],
          parameters: [slugParam, channelParam, { name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': feedDocumentResponse,
            '302': { description: t.responses.artifactRedirect },
            '404': notFound,
          },
        },
      },
    },
  }
}

const slugParam = { name: 'appSlug', in: 'path' as const, required: true, schema: { type: 'string' } }
const channelParam = { name: 'channel', in: 'path' as const, required: true, schema: { type: 'string' } }
const versionParam = { name: 'version', in: 'path' as const, required: true, schema: { type: 'string' } }
const localeParam = { name: 'locale', in: 'path' as const, required: true, schema: { type: 'string' } }
