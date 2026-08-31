import { and, desc, eq, isNotNull } from 'drizzle-orm'
import { db } from '~/db/index.ts'
import { artifacts, versions } from '~/db/schema.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { cachedText } from '~/lib/object-cache.ts'
import { getObjectText, presignGet, settingsFromApp } from '~/lib/storage.ts'
import { getAppBySlug } from './apps.ts'
import { getChannel } from './channels.ts'
import { recordHit } from './hits.ts'
import { adapterFor } from './updaters/index.ts'

/**
 * Serves the update feed. Document shape is the app's updater adapter;
 * artifacts always 302 to storage (ADR: update-feed-proxy, updater-kind-on-app).
 */
export async function resolveFeedRequest(
  appSlug: string,
  channelName: string,
  filename: string,
  origin: string,
): Promise<{ kind: 'document'; contentType: string; body: string } | { kind: 'redirect'; url: string }> {
  const app = await getAppBySlug(appSlug)
  const channel = await getChannel(app.id, channelName)
  const s3 = settingsFromApp(app)
  const adapter = adapterFor(app.updaterKind)

  if (!channel.currentVersionId) {
    throw new ShukkaError('not_found', `Channel "${channelName}" has no published version`)
  }

  const [current] = await db.select().from(versions).where(eq(versions.id, channel.currentVersionId)).limit(1)
  if (!current?.releasedAt) {
    throw new ShukkaError('not_found', `Channel "${channelName}" has no published version`)
  }

  const currentArtifacts = await db.select().from(artifacts).where(eq(artifacts.versionId, current.id))

  if (adapter.generateFeedDocument) {
    const generated = await adapter.generateFeedDocument({
      filename,
      origin,
      appSlug,
      channelName,
      releasedAt: current.releasedAt,
      version: current.version,
      artifacts: currentArtifacts,
      getText: (key) => cachedText(`s3:${app.id}:${key}`, () => getObjectText(s3, key)),
    })
    if (generated) {
      await recordHit(current.id, 'metadata')
      return { kind: 'document', contentType: generated.contentType, body: generated.body }
    }
  }

  if (adapter.isMetadataFile(filename)) {
    const artifact = currentArtifacts.find((entry) => entry.filename === filename)
    if (!artifact) throw new ShukkaError('not_found', `${filename} is not part of the current release`)
    const body = await cachedText(`s3:${app.id}:${artifact.s3Key}`, () => getObjectText(s3, artifact.s3Key))
    await recordHit(current.id, 'metadata')
    return { kind: 'document', contentType: 'text/yaml; charset=utf-8', body }
  }

  const currentMatch = currentArtifacts.find((entry) => entry.filename === filename)
  if (currentMatch) {
    await recordHit(current.id, 'artifact')
    return { kind: 'redirect', url: await presignGet(s3, currentMatch.s3Key) }
  }

  const [artifact] = await db
    .select({ s3Key: artifacts.s3Key, versionId: artifacts.versionId })
    .from(artifacts)
    .innerJoin(versions, eq(artifacts.versionId, versions.id))
    .where(and(eq(versions.channelId, channel.id), eq(artifacts.filename, filename), isNotNull(versions.releasedAt)))
    .orderBy(desc(versions.releasedAt), desc(versions.id))
    .limit(1)
  if (!artifact) throw new ShukkaError('not_found', `${filename} not found on channel "${channelName}"`)

  await recordHit(artifact.versionId, 'artifact')
  return { kind: 'redirect', url: await presignGet(s3, artifact.s3Key) }
}

export function feedBaseUrl(origin: string, appSlug: string, channelName: string): string {
  return `${origin.replace(/\/+$/, '')}/api/update/${appSlug}/${channelName}`
}

/** Shared response for the channel-root and splat feed routes. */
export async function serveFeedRequest(
  request: Request,
  appSlug: string,
  channelName: string,
  filename: string,
): Promise<Response> {
  const result = await resolveFeedRequest(appSlug, channelName, filename, new URL(request.url).origin)
  if (result.kind === 'redirect') {
    return new Response(null, {
      status: 302,
      headers: { location: result.url, 'cache-control': 'no-store' },
    })
  }
  return new Response(result.body, {
    headers: { 'content-type': result.contentType, 'cache-control': 'no-store' },
  })
}
