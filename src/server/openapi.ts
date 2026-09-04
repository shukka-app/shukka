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
import { openApiCopy, type OpenApiLocale } from './openapi-copy.ts'

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

function jsonContent(schema: z.ZodType, io: 'input' | 'output' = 'output') {
  return { 'application/json': { schema: jsonSchema(schema, io) } }
}

function jsonResponse(description: string, schema: z.ZodType) {
  return { description, content: jsonContent(schema) }
}

function jsonBody(schema: z.ZodType) {
  return { required: true, content: jsonContent(schema, 'input') }
}

export function openApiDocument(origin: string, locale: OpenApiLocale = 'en') {
  const t = openApiCopy(locale)
  const server = origin.replace(/\/+$/, '')
  const errorContent = jsonContent(errorSchema)
  const notFound = { description: t.responses.notFound, content: errorContent }
  const artifactMissing = { description: t.responses.artifactMissing, content: errorContent }
  const feedDocumentResponse = {
    description: t.responses.feedDocument,
    content: {
      'application/json': { schema: jsonSchema(tauriFeedSchema) },
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
      schemas: {
        Error: jsonSchema(errorSchema),
      },
    },
    security: [{ apiKey: [] }, { session: [] }],
    paths: {
      '/api/v1/apps/{appSlug}': {
        get: {
          tags: [t.tags.app.name],
          summary: t.ops.getApp.summary,
          parameters: [slugParam],
          responses: { '200': jsonResponse(t.responses.appDetail, appDetailResponseSchema) },
        },
        patch: {
          tags: [t.tags.app.name],
          summary: t.ops.patchApp.summary,
          description: t.ops.patchApp.description,
          parameters: [slugParam],
          requestBody: jsonBody(appInputSchema),
          responses: { '200': jsonResponse(t.responses.updatedApp, appUpdateResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels': {
        get: {
          tags: [t.tags.channels.name],
          summary: t.ops.listChannels.summary,
          parameters: [slugParam],
          responses: { '200': jsonResponse(t.responses.channelList, channelListResponseSchema) },
        },
        post: {
          tags: [t.tags.channels.name],
          summary: t.ops.createChannel.summary,
          parameters: [slugParam],
          requestBody: jsonBody(createChannelBodySchema),
          responses: { '201': jsonResponse(t.responses.created, channelCreateResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}': {
        patch: {
          tags: [t.tags.channels.name],
          summary: t.ops.setCurrent.summary,
          parameters: [slugParam, channelParam],
          requestBody: jsonBody(setCurrentVersionBodySchema),
          responses: { '200': jsonResponse(t.responses.updated, okResponseSchema) },
        },
        delete: {
          tags: [t.tags.channels.name],
          summary: t.ops.deleteChannel.summary,
          parameters: [slugParam, channelParam],
          responses: { '200': jsonResponse(t.responses.deleted, okResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/trend': {
        get: {
          tags: [t.tags.channels.name],
          summary: t.ops.channelTrend.summary,
          parameters: [slugParam, channelParam, { name: 'range', in: 'query', schema: { type: 'integer', enum: [7, 30, 90] } }],
          responses: { '200': jsonResponse(t.responses.trendSeries, channelTrendResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}': {
        delete: {
          tags: [t.tags.versions.name],
          summary: t.ops.deleteVersion.summary,
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse(t.responses.deleted, okResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/artifacts/{filename}': {
        get: {
          tags: [t.tags.versions.name],
          summary: t.ops.getArtifact.summary,
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
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend': {
        get: {
          tags: [t.tags.versions.name],
          summary: t.ops.versionTrend.summary,
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse(t.responses.trendSeries, versionTrendResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes': {
        get: {
          tags: [t.tags.notes.name],
          summary: t.ops.editorNotes.summary,
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': jsonResponse(t.responses.notes, editorNotesResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes/{locale}': {
        put: {
          tags: [t.tags.notes.name],
          summary: t.ops.upsertNote.summary,
          parameters: [slugParam, channelParam, versionParam, localeParam],
          requestBody: jsonBody(upsertNoteBodySchema),
          responses: { '200': jsonResponse(t.responses.savedNote, savedNoteResponseSchema) },
        },
        delete: {
          tags: [t.tags.notes.name],
          summary: t.ops.deleteNote.summary,
          parameters: [slugParam, channelParam, versionParam, localeParam],
          responses: { '200': jsonResponse(t.responses.deleted, okResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/notes': {
        get: {
          tags: [t.tags.notes.name],
          summary: t.ops.publicNotes.summary,
          security: [],
          parameters: [
            slugParam,
            channelParam,
            { name: 'from', in: 'query', schema: { type: 'string' } },
            { name: 'to', in: 'query', schema: { type: 'string' } },
            { name: 'locale', in: 'query', schema: { type: 'string' } },
          ],
          responses: { '200': jsonResponse(t.responses.publicNotes, publicNotesResponseSchema) },
        },
      },
      '/api/v1/apps/{appSlug}/notes-config': {
        put: {
          tags: [t.tags.notes.name],
          summary: t.ops.saveNotesConfig.summary,
          parameters: [slugParam],
          requestBody: jsonBody(notesConfigSchema),
          responses: { '200': jsonResponse(t.responses.savedConfig, notesConfigResponseSchema) },
        },
      },
      '/api/v1/upload/init': {
        post: {
          tags: [t.tags.upload.name],
          summary: t.ops.uploadInit.summary,
          security: [{ apiKey: [] }],
          requestBody: jsonBody(uploadInitBodySchema),
          responses: { '200': jsonResponse(t.responses.uploadInit, uploadInitResponseSchema) },
        },
      },
      '/api/v1/upload/finalize': {
        post: {
          tags: [t.tags.upload.name],
          summary: t.ops.uploadFinalize.summary,
          security: [{ apiKey: [] }],
          requestBody: jsonBody(uploadFinalizeBodySchema),
          responses: { '200': jsonResponse(t.responses.versionCreated, uploadFinalizeResponseSchema) },
        },
      },
      '/api/update/{appSlug}/{channel}': {
        get: {
          tags: [t.tags.feed.name],
          summary: t.ops.channelFeed.summary,
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
          summary: t.ops.publicFeed.summary,
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
