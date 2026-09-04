/**
 * Narrative copy for `openApiDocument`. `en` is the source language and type
 * source; `zh` uses `satisfies OpenApiCopy` so a missing key is a compile-time
 * error. Paths, methods, parameter names, and Zod JSON Schema stay outside
 * this dictionary (ADR: openapi-locale).
 */
export type OpenApiLocale = 'en' | 'zh'

export const en = {
  info: {
    title: 'Shukka API',
    description:
      'Operations an API key (or panel session) can call under `/api/v1/apps/{appSlug}`, the upload protocol, and the public no-auth feed. Session-only admin operations (delete the app, API key lifecycle, instance-level routes under `/api/admin`) are not documented here.',
  },
  tags: {
    app: { name: 'App', description: 'Read and update one app.' },
    channels: { name: 'Channels', description: 'Channels and current-version promote / rollback.' },
    versions: { name: 'Versions', description: 'Delete a version; read its notes and trend; download an artifact.' },
    notes: { name: 'Notes', description: 'Per-version release notes (editor) and public read.' },
    upload: { name: 'Upload', description: 'Presigned direct upload; defaults to draft.' },
    feed: { name: 'Feed', description: 'Public update feed (Electron yml or Tauri JSON) — no auth.' },
  },
  responses: {
    notFound: 'Missing or draft',
    artifactMissing: 'Missing version or file',
    appDetail: 'App detail',
    updatedApp: 'Updated app',
    channelList: 'Channel list',
    created: 'Created',
    updated: 'Updated',
    deleted: 'Deleted',
    trendSeries: 'Trend series',
    redirectToStorage: 'Redirect to storage',
    notes: 'Notes',
    savedNote: 'Saved note',
    publicNotes: 'Public notes',
    savedConfig: 'Saved config',
    uploadInit: 'uploadId and presigned PUT URLs',
    versionCreated: 'Version created',
    feedDocument: 'Generated feed document',
    artifactRedirect: 'Artifact redirect',
  },
  ops: {
    getApp: { summary: 'App detail (channels, versions, keys)' },
    patchApp: {
      summary: 'Update app settings (probes S3)',
      description:
        'API keys may only change `name`. Slug and storage fields are session-only; resubmitting unchanged values is allowed. Changing endpoint/bucket/prefix with existing artifacts probes the newest object at the new location.',
    },
    listChannels: { summary: 'List channels' },
    createChannel: { summary: 'Create a channel' },
    setCurrent: { summary: 'Set currentVersion (promote draft or rollback)' },
    deleteChannel: { summary: 'Delete a channel and its objects' },
    channelTrend: { summary: 'Channel hit trend' },
    deleteVersion: { summary: 'Delete a version and its objects' },
    getArtifact: {
      summary: 'Presigned GET for one artifact on that version (drafts included). Does not increment hits.',
    },
    versionTrend: { summary: 'Version hit trend (empty for drafts)' },
    editorNotes: { summary: 'Editor read model — every locale for one version' },
    upsertNote: { summary: 'Upsert a locale note' },
    deleteNote: { summary: 'Delete a locale note' },
    publicNotes: { summary: 'Public notes — released versions only, no auth' },
    saveNotesConfig: { summary: 'Save release-log config (no S3 probe)' },
    uploadInit: {
      summary:
        'Start a pending upload. Electron requires at least one `.yml`; Tauri requires `latest.json` and/or artifact+`.sig` pairs; Sparkle requires `appcast.xml` and/or archive+`.sig` (see spec).',
    },
    uploadFinalize: { summary: 'Create a version. Default is draft; `release: true` goes live.' },
    channelFeed: { summary: 'Channel-root feed. Tauri returns JSON; Sparkle returns a one-item appcast.' },
    publicFeed: {
      summary: 'Public feed — Electron yml / Tauri latest.json / Sparkle appcast, artifacts 302. Drafts are 404.',
    },
  },
}

export type OpenApiCopy = typeof en

export const zh = {
  info: {
    title: 'Shukka API',
    description:
      'API key（或面板 session）可调用的操作，覆盖 `/api/v1/apps/{appSlug}` 下的 App API、上传协议，以及公开无鉴权的更新 feed。仅 session 的管理操作（删除应用、API key 生命周期、`/api/admin` 下的实例级路由）不在此文档中。',
  },
  tags: {
    app: { name: '应用', description: '读取并更新单个应用。' },
    channels: { name: '渠道', description: '渠道，以及当前版本的 promote / 回滚。' },
    versions: { name: '版本', description: '删除版本；读取其 notes 与趋势；下载制品。' },
    notes: { name: '发布说明', description: '按版本的 release notes（编辑面）与公开读取。' },
    upload: { name: '上传', description: '预签名直传；默认落为草稿。' },
    feed: { name: '更新源', description: '公开更新 feed（Electron yml 或 Tauri JSON）——无需鉴权。' },
  },
  responses: {
    notFound: '不存在或仍为草稿',
    artifactMissing: '版本或文件不存在',
    appDetail: '应用详情',
    updatedApp: '已更新的应用',
    channelList: '渠道列表',
    created: '已创建',
    updated: '已更新',
    deleted: '已删除',
    trendSeries: '趋势序列',
    redirectToStorage: '重定向到存储',
    notes: '发布说明',
    savedNote: '已保存的 note',
    publicNotes: '公开 notes',
    savedConfig: '已保存的配置',
    uploadInit: 'uploadId 与预签名 PUT URL',
    versionCreated: '已创建的版本',
    feedDocument: '生成的 feed 文档',
    artifactRedirect: '制品重定向',
  },
  ops: {
    getApp: { summary: '应用详情（渠道、版本、keys）' },
    patchApp: {
      summary: '更新应用设置（会探测 S3）',
      description:
        'API key 只能改 `name`。slug 与存储字段仅 session 可改；原样回传未变更的值是允许的。在已有制品时改 endpoint/bucket/prefix，会探测新位置上最新对象是否存在。',
    },
    listChannels: { summary: '列出渠道' },
    createChannel: { summary: '创建渠道' },
    setCurrent: { summary: '设置 currentVersion（promote 草稿或回滚）' },
    deleteChannel: { summary: '删除渠道及其对象' },
    channelTrend: { summary: '渠道命中趋势' },
    deleteVersion: { summary: '删除版本及其对象' },
    getArtifact: { summary: '对该版本上单个制品签发预签名 GET（含草稿）。不计入命中。' },
    versionTrend: { summary: '版本命中趋势（草稿为空）' },
    editorNotes: { summary: '编辑器读模型——某一版本的全部 locale' },
    upsertNote: { summary: '写入某一 locale 的 note' },
    deleteNote: { summary: '删除某一 locale 的 note' },
    publicNotes: { summary: '公开 notes——仅已发布版本，无需鉴权' },
    saveNotesConfig: { summary: '保存 release-log 配置（不探测 S3）' },
    uploadInit: {
      summary:
        '开始一次待完成的上传。Electron 至少需要一个 `.yml`；Tauri 需要 `latest.json` 和/或制品+`.sig` 成对；Sparkle 需要 `appcast.xml` 和/或归档+`.sig`（见 spec）。',
    },
    uploadFinalize: { summary: '创建版本。默认是草稿；`release: true` 则立即上线。' },
    channelFeed: { summary: '渠道根 feed。Tauri 返回 JSON；Sparkle 返回单条目 appcast。' },
    publicFeed: {
      summary: '公开 feed——Electron yml / Tauri latest.json / Sparkle appcast，制品 302。草稿为 404。',
    },
  },
} satisfies OpenApiCopy

export function openApiCopy(locale: OpenApiLocale = 'en') {
  return locale === 'zh' ? zh : en
}
