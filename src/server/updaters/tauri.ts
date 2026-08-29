import { ShukkaError } from '~/lib/errors.ts'
import { inferTauriTarget } from '~/lib/tauri-target.ts'
import type { UpdateAdapter } from './types.ts'

const MANIFEST = 'latest.json'

/** Uploader-side collect/version (no latest.json required) lives in scripts/updaters/tauri.mjs. */

function basename(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? url)
  } catch {
    return decodeURIComponent(url.split('/').pop() ?? url)
  }
}

function parseLatestJson(text: string): {
  version: string
  platforms: Record<string, { url?: string; signature?: string }>
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new ShukkaError('metadata_error', 'latest.json is not valid JSON', String(error))
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new ShukkaError('metadata_error', 'latest.json is not an updater document')
  }
  const record = parsed as Record<string, unknown>
  const version = typeof record.version === 'string' ? record.version.replace(/^v/, '') : ''
  if (!version) throw new ShukkaError('metadata_error', 'latest.json has no "version" field')

  const platforms =
    record.platforms && typeof record.platforms === 'object'
      ? (record.platforms as Record<string, { url?: string; signature?: string }>)
      : {}
  return { version, platforms }
}

export const tauriAdapter: UpdateAdapter = {
  kind: 'tauri',
  isMetadataFile(filename) {
    return filename === MANIFEST || filename.endsWith('.sig')
  },
  hasRequiredMetadata: hasTauriMetadata,
  missingMetadataMessage: 'A Tauri release needs latest.json and/or updater artifacts with matching .sig files',
  parseMetadata(filename, text) {
    if (filename === MANIFEST) {
      const { version, platforms } = parseLatestJson(text)
      const referenced = Object.values(platforms).flatMap((platform) => {
        if (!platform?.url) return []
        const name = basename(platform.url)
        return name ? [name] : []
      })
      return { version, referenced }
    }
    return { version: '', referenced: [] }
  },
  async generateFeedDocument({
    filename,
    origin,
    appSlug,
    channelName,
    releasedAt,
    version,
    artifacts,
    getText,
  }) {
    if (filename && filename !== MANIFEST) return null
    const base = `${origin.replace(/\/+$/, '')}/api/update/${appSlug}/${channelName}`
    const platforms: Record<string, { url: string; signature: string }> = {}

    const uploaded = artifacts.find((file) => file.filename === MANIFEST)
    if (uploaded) {
      const { platforms: declared } = parseLatestJson(await getText(uploaded.s3Key))
      for (const [target, platform] of Object.entries(declared)) {
        if (!platform?.url) continue
        const name = basename(platform.url)
        const artifact = artifacts.find((file) => file.filename === name)
        if (!artifact) continue
        const sigFile = artifacts.find((file) => file.filename === `${name}.sig`)
        const signature = platform.signature || (sigFile ? await getText(sigFile.s3Key) : '')
        if (!signature) continue
        platforms[target] = { url: `${base}/${encodeURIComponent(name)}`, signature: signature.trim() }
      }
    } else {
      for (const artifact of artifacts) {
        if (artifact.filename.endsWith('.sig') || artifact.filename === MANIFEST) continue
        const target = inferTauriTarget(artifact.filename)
        const sigFile = artifacts.find((file) => file.filename === `${artifact.filename}.sig`)
        if (!target || !sigFile) continue
        platforms[target] = {
          url: `${base}/${encodeURIComponent(artifact.filename)}`,
          signature: (await getText(sigFile.s3Key)).trim(),
        }
      }
    }

    if (Object.keys(platforms).length === 0) {
      throw new ShukkaError('not_found', 'Current release has no Tauri updater platforms')
    }

    return {
      contentType: 'application/json; charset=utf-8',
      body: `${JSON.stringify({
        version,
        pub_date: new Date(releasedAt * 1000).toISOString(),
        platforms,
      })}\n`,
    }
  },
  platformsOf(artifacts) {
    const found = new Set<string>()
    for (const artifact of artifacts) {
      const target = inferTauriTarget(artifact.filename)
      if (!target) continue
      if (target.startsWith('darwin')) found.add('macOS')
      else if (target.startsWith('linux')) found.add('Linux')
      else if (target.startsWith('windows')) found.add('Windows')
    }
    return ['macOS', 'Windows', 'Linux'].filter((platform) => found.has(platform))
  },
}

export function hasTauriMetadata(filenames: string[]): boolean {
  if (filenames.includes(MANIFEST)) return true
  return filenames.some((name) => name.endsWith('.sig') && filenames.includes(name.slice(0, -4)))
}

export function assertTauriUpload(filenames: string[]): void {
  if (!hasTauriMetadata(filenames)) {
    throw new ShukkaError('invalid_request', tauriAdapter.missingMetadataMessage)
  }
}
