import { ShukkaError } from '~/lib/errors.ts'
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

/**
 * Best-effort Tauri updater `platforms` key from an artifact filename.
 * Explicit arch tokens win. Arch-less Linux / Darwin default to `x86_64`
 * (see docs/adr/updater-kind-on-app.md). Windows still requires an arch token.
 */
export function inferTauriTarget(filename: string): string | null {
  const name = filename.toLowerCase()
  const arch =
    name.includes('aarch64') || name.includes('arm64')
      ? 'aarch64'
      : name.includes('i686') || name.includes('ia32')
        ? 'i686'
        : name.includes('armv7')
          ? 'armv7'
          : name.includes('x64') || name.includes('x86_64') || name.includes('amd64')
            ? 'x86_64'
            : null

  const os = name.includes('darwin') || name.includes('mac') || name.endsWith('.app.tar.gz')
    ? 'darwin'
    : name.includes('linux') || name.includes('appimage')
      ? 'linux'
      : name.includes('win') || name.includes('nsis') || name.includes('msi')
        ? 'windows'
        : null

  if (!os) return null
  if (arch) return `${os}-${arch}`
  if (os === 'linux' || os === 'darwin') return `${os}-x86_64`
  return null
}

/**
 * Tauri production clients require HTTPS end to end, so feed URLs always use
 * https — except loopback origins (local dev / e2e), which keep their scheme.
 * See docs/adr/tauri-feed-https.md.
 */
export function tauriFeedOrigin(origin: string): string {
  const url = new URL(origin)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol === 'http:' && !loopback) url.protocol = 'https:'
  return url.origin
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
    const base = `${tauriFeedOrigin(origin)}/api/update/${appSlug}/${channelName}`
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
        const target = tauriAdapter.inferFeedTarget(artifact.filename)
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
  inferFeedTarget: inferTauriTarget,
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
