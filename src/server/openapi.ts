/**
 * OpenAPI 3 document for the operations an API key (or panel session) can
 * call: the programmatic App API under `/api/v1/apps/{slug}`, the upload
 * protocol, and the public no-auth feed and notes. Session-only admin
 * operations (delete app, API key lifecycle, instance-level routes) are
 * intentionally omitted (ADR: app-api-v1).
 */
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
    },
    security: [{ apiKey: [] }, { session: [] }],
    paths: {
      '/api/v1/apps/{appSlug}': {
        get: {
          tags: ['App'],
          summary: 'App detail (channels, versions, keys)',
          parameters: [slugParam],
          responses: { '200': { description: 'App detail' } },
        },
        patch: {
          tags: ['App'],
          summary: 'Update app settings (probes S3)',
          description:
            'API keys may only change `name`. Slug and storage fields are session-only; resubmitting unchanged values is allowed. Changing endpoint/bucket/prefix with existing artifacts probes the newest object at the new location.',
          parameters: [slugParam],
          responses: { '200': { description: 'Updated app' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels': {
        get: {
          tags: ['Channels'],
          summary: 'List channels',
          parameters: [slugParam],
          responses: { '200': { description: 'Channel list' } },
        },
        post: {
          tags: ['Channels'],
          summary: 'Create a channel',
          parameters: [slugParam],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } },
          },
          responses: { '201': { description: 'Created' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}': {
        patch: {
          tags: ['Channels'],
          summary: 'Set currentVersion (promote draft or rollback)',
          parameters: [slugParam, channelParam],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentVersion'],
                  properties: { currentVersion: { type: 'string', nullable: true, description: 'Version string, or null to clear current' } },
                },
              },
            },
          },
          responses: { '200': { description: 'Updated' } },
        },
        delete: {
          tags: ['Channels'],
          summary: 'Delete a channel and its objects',
          parameters: [slugParam, channelParam],
          responses: { '200': { description: 'Deleted' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/trend': {
        get: {
          tags: ['Channels'],
          summary: 'Channel hit trend',
          parameters: [slugParam, channelParam, { name: 'range', in: 'query', schema: { type: 'integer', enum: [7, 30, 90] } }],
          responses: { '200': { description: 'Trend series' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}': {
        delete: {
          tags: ['Versions'],
          summary: 'Delete a version and its objects',
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': { description: 'Deleted' } },
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
          responses: { '302': { description: 'Redirect to storage' }, '404': { description: 'Missing version or file' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/trend': {
        get: {
          tags: ['Versions'],
          summary: 'Version hit trend (empty for drafts)',
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': { description: 'Trend series' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes': {
        get: {
          tags: ['Notes'],
          summary: 'Editor read model — every locale for one version',
          parameters: [slugParam, channelParam, versionParam],
          responses: { '200': { description: 'Notes' } },
        },
      },
      '/api/v1/apps/{appSlug}/channels/{channel}/versions/{version}/notes/{locale}': {
        put: {
          tags: ['Notes'],
          summary: 'Upsert a locale note',
          parameters: [slugParam, channelParam, versionParam, localeParam],
          requestBody: {
            content: { 'application/json': { schema: { type: 'object', required: ['markdown'], properties: { markdown: { type: 'string' } } } } },
          },
          responses: { '200': { description: 'Saved note' } },
        },
        delete: {
          tags: ['Notes'],
          summary: 'Delete a locale note',
          parameters: [slugParam, channelParam, versionParam, localeParam],
          responses: { '200': { description: 'Deleted' } },
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
          responses: { '200': { description: 'Public notes' } },
        },
      },
      '/api/v1/apps/{appSlug}/notes-config': {
        put: {
          tags: ['Notes'],
          summary: 'Save release-log config (no S3 probe)',
          parameters: [slugParam],
          responses: { '200': { description: 'Saved config' } },
        },
      },
      '/api/v1/upload/init': {
        post: {
          tags: ['Upload'],
          summary:
            'Start a pending upload. Electron requires at least one `.yml`; Tauri requires `latest.json` and/or artifact+`.sig` pairs; Sparkle requires `appcast.xml` and/or archive+`.sig` (see spec).',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['channel', 'version', 'files'],
                  properties: {
                    app: { type: 'string' },
                    channel: { type: 'string' },
                    version: { type: 'string' },
                    createChannel: { type: 'boolean' },
                    files: {
                      type: 'array',
                      minItems: 1,
                      items: {
                        type: 'object',
                        required: ['filename'],
                        properties: {
                          filename: { type: 'string' },
                          size: { type: 'integer', minimum: 0 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'uploadId and presigned PUT URLs' } },
        },
      },
      '/api/v1/upload/finalize': {
        post: {
          tags: ['Upload'],
          summary: 'Create a version. Default is draft; `release: true` goes live.',
          security: [{ apiKey: [] }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['uploadId'],
                  properties: {
                    uploadId: { type: 'string' },
                    app: { type: 'string' },
                    release: { type: 'boolean', default: false },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Version created' } },
        },
      },
      '/api/update/{appSlug}/{channel}': {
        get: {
          tags: ['Feed'],
          summary: 'Channel-root feed. Tauri returns JSON; Sparkle returns a one-item appcast.',
          security: [],
          parameters: [slugParam, channelParam],
          responses: { '200': { description: 'Generated feed document' }, '404': { description: 'Missing or draft' } },
        },
      },
      '/api/update/{appSlug}/{channel}/{filename}': {
        get: {
          tags: ['Feed'],
          summary: 'Public feed — Electron yml / Tauri latest.json / Sparkle appcast, artifacts 302. Drafts are 404.',
          security: [],
          parameters: [slugParam, channelParam, { name: 'filename', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Metadata body' }, '302': { description: 'Artifact redirect' }, '404': { description: 'Missing or draft' } },
        },
      },
    },
  }
}

const slugParam = { name: 'appSlug', in: 'path' as const, required: true, schema: { type: 'string' } }
const channelParam = { name: 'channel', in: 'path' as const, required: true, schema: { type: 'string' } }
const versionParam = { name: 'version', in: 'path' as const, required: true, schema: { type: 'string' } }
const localeParam = { name: 'locale', in: 'path' as const, required: true, schema: { type: 'string' } }
