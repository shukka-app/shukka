import type { PublicApp } from '~/server/dashboard.ts'
import type { HighlightLang } from '~/server/highlight.ts'

/**
 * The publish skill installs from the Shukka repo, pinned to the commit this
 * server was built from (`__GIT_SHA__` is inlined by vite at build time). The
 * CLI can't check out a bare commit, so the URL is the commit's tarball, which
 * it downloads and searches for skills. The 'dev' fallback (no git metadata
 * at build time) tracks main instead of a dead URL.
 */
const skillRef = /^[0-9a-f]{40}$/.test(__GIT_SHA__) ? __GIT_SHA__ : 'main'

export type Snippet = { code: string; lang: HighlightLang; html: string }

export type IntegrationSnippets = {
  builderConfig: Snippet
  mainProcess: Snippet
  githubAction: Snippet
  httpApi: Snippet
  agentCli: Snippet
}

/** One-line reminder that the API default is draft and invisible to the feed. */
function draftIfOmitted(channelName: string): string {
  return `omit to create a draft the feed cannot see; promote in the panel or PATCH .../channels/${channelName} {"currentVersion":"…"}`
}

function electronSnippets({
  app,
  channelName,
  feedUrl,
  serverUrl,
}: {
  app: PublicApp
  channelName: string
  feedUrl: string
  serverUrl: string
}): Record<keyof IntegrationSnippets, { code: string; lang: HighlightLang }> {
  return {
    builderConfig: {
      lang: 'yaml',
      code: `# electron-builder.yml
publish:
  provider: generic
  url: ${feedUrl}`,
    },
    mainProcess: {
      lang: 'ts',
      code: `import { autoUpdater } from 'electron-updater'

autoUpdater.setFeedURL({
  provider: 'generic',
  url: '${feedUrl}',
})
autoUpdater.checkForUpdatesAndNotify()`,
    },
    githubAction: {
      lang: 'yaml',
      code: `- uses: shukka-app/shukka@v1.0.2
  with:
    server-url: \${{ secrets.SHUKKA_URL }}
    api-key: \${{ secrets.SHUKKA_API_KEY }}
    app: ${app.slug}
    channel: ${channelName}
    directory: dist
    release: true   # ${draftIfOmitted(channelName)}`,
    },
    httpApi: {
      lang: 'bash',
      code: `# 1. Init — returns uploadId + a presigned PUT URL per file
curl -X POST ${serverUrl}/api/v1/upload/init \\
  -H "Authorization: Bearer $SHUKKA_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"app":"${app.slug}","channel":"${channelName}","version":"1.4.2","files":[{"filename":"latest.yml","size":412}]}'

# 2. Upload each file's bytes straight to S3
curl -X PUT --data-binary @latest.yml "<uploadUrl from init>"

# 3. Finalize — "release":true goes live now; ${draftIfOmitted(channelName)}.
curl -X POST ${serverUrl}/api/v1/upload/finalize \\
  -H "Authorization: Bearer $SHUKKA_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"uploadId":"<uploadId>","app":"${app.slug}","release":true}'

# Release notes (public, no auth) — only if the app enabled Release log
curl "${serverUrl}/api/v1/apps/${app.slug}/channels/${channelName}/notes?from=1.0.0&locale=en-US"`,
    },
    agentCli: {
      lang: 'bash',
      code: `# Installs the Shukka publish skill into your coding agent (Claude Code, Cursor, Codex, ...)
npx skills add https://github.com/shukka-app/shukka/archive/${skillRef}.tar.gz --skill shukka-publish`,
    },
  }
}

function sparkleSnippets({
  app,
  channelName,
  feedUrl,
  serverUrl,
}: {
  app: PublicApp
  channelName: string
  feedUrl: string
  serverUrl: string
}): Record<keyof IntegrationSnippets, { code: string; lang: HighlightLang }> {
  const appcastUrl = `${feedUrl.replace(/\/+$/, '')}/appcast.xml`
  return {
    builderConfig: {
      lang: 'xml',
      code: `<!-- Info.plist -->
<key>SUFeedURL</key>
<string>${appcastUrl}</string>
<key>SUPublicEDKey</key>
<string>YOUR_EDDSA_PUBLIC_KEY</string>`,
    },
    mainProcess: {
      lang: 'swift',
      code: `import Sparkle

// SUFeedURL + SUPublicEDKey come from Info.plist.
// Sparkle compares sparkle:version and downloads the enclosure (a 302).
let controller = SPUStandardUpdaterController(
  startingUpdater: true,
  updaterDelegate: nil,
  userDriverDelegate: nil
)`,
    },
    githubAction: {
      lang: 'yaml',
      code: `- uses: shukka-app/shukka@v1.0.2
  with:
    server-url: \${{ secrets.SHUKKA_URL }}
    api-key: \${{ secrets.SHUKKA_API_KEY }}
    app: ${app.slug}
    channel: ${channelName}
    directory: dist
    # release: true   # omit to leave the version as a draft`,
    },
    httpApi: {
      lang: 'bash',
      code: `# 1. Init — appcast.xml and/or a zip/dmg + matching .sig from sign_update
curl -X POST ${serverUrl}/api/v1/upload/init \\
  -H "Authorization: Bearer $SHUKKA_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"app":"${app.slug}","channel":"${channelName}","version":"1.4.2","files":[{"filename":"appcast.xml"},{"filename":"App-1.4.2.zip"},{"filename":"App-1.4.2.zip.sig"}]}'

# 2. Upload each file's bytes straight to S3
curl -X PUT --data-binary @appcast.xml "<uploadUrl from init>"

# 3. Finalize — creates a draft. Add "release":true to go live immediately.
curl -X POST ${serverUrl}/api/v1/upload/finalize \\
  -H "Authorization: Bearer $SHUKKA_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"uploadId":"<uploadId>","app":"${app.slug}"}'

# Release notes (public, no auth) — only if the app enabled Release log
curl "${serverUrl}/api/v1/apps/${app.slug}/channels/${channelName}/notes?from=1.0.0&locale=en-US"`,
    },
    agentCli: {
      lang: 'bash',
      code: `# Installs the Shukka publish skill into your coding agent (Claude Code, Cursor, Codex, ...)
npx skills add https://github.com/shukka-app/shukka/archive/${skillRef}.tar.gz --skill shukka-publish`,
    },
  }
}

function tauriSnippets({
  app,
  channelName,
  feedUrl,
  serverUrl,
}: {
  app: PublicApp
  channelName: string
  feedUrl: string
  serverUrl: string
}): Record<keyof IntegrationSnippets, { code: string; lang: HighlightLang }> {
  return {
    builderConfig: {
      lang: 'jsonc',
      code: `// tauri.conf.json
// Shukka fills only endpoints. Everything else: you fill these; not Shukka.
{
  "bundle": {
    // you fill this; not Shukka — required, or the build writes no .sig
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "endpoints": ["${feedUrl}"],
      // you fill this; not Shukka — minisign public key string from
      // \`tauri signer generate\`, not a file path. Set TAURI_SIGNING_PRIVATE_KEY at build time.
      "pubkey": "<YOUR_TAURI_UPDATER_PUBKEY>"
      // HTTP feeds only (local / non-TLS). You fill this; not Shukka.
      // Production: HTTPS and omit this key.
      // "dangerousInsecureTransportProtocol": true
    }
  }
}`,
    },
    mainProcess: {
      lang: 'ts',
      code: `import { check } from '@tauri-apps/plugin-updater'
// optional — official Tauri docs; you fill this; not Shukka:
// import { relaunch } from '@tauri-apps/plugin-process'

const update = await check()
if (update) {
  await update.downloadAndInstall()
  // optional: await relaunch()
}`,
    },
    githubAction: {
      lang: 'yaml',
      code: `- uses: shukka-app/shukka@v1.0.2
  with:
    server-url: \${{ secrets.SHUKKA_URL }}
    api-key: \${{ secrets.SHUKKA_API_KEY }}
    app: ${app.slug}
    channel: ${channelName}
    directory: src-tauri/target/release/bundle
    release: true   # ${draftIfOmitted(channelName)}`,
    },
    httpApi: {
      lang: 'bash',
      code: `# 1. Init — latest.json and/or updater artifacts with matching .sig files
curl -X POST ${serverUrl}/api/v1/upload/init \\
  -H "Authorization: Bearer $SHUKKA_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"app":"${app.slug}","channel":"${channelName}","version":"1.4.2","files":[{"filename":"latest.json"},{"filename":"app-aarch64.app.tar.gz"},{"filename":"app-aarch64.app.tar.gz.sig"}]}'

# 2. Upload each file's bytes straight to S3
curl -X PUT --data-binary @latest.json "<uploadUrl from init>"

# 3. Finalize — "release":true goes live now; ${draftIfOmitted(channelName)}.
curl -X POST ${serverUrl}/api/v1/upload/finalize \\
  -H "Authorization: Bearer $SHUKKA_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"uploadId":"<uploadId>","app":"${app.slug}","release":true}'

# Release notes (public, no auth) — only if the app enabled Release log
curl "${serverUrl}/api/v1/apps/${app.slug}/channels/${channelName}/notes?from=1.0.0&locale=en-US"`,
    },
    agentCli: {
      lang: 'bash',
      code: `# Installs the Shukka publish skill into your coding agent (Claude Code, Cursor, Codex, ...)
npx skills add https://github.com/shukka-app/shukka/archive/${skillRef}.tar.gz --skill shukka-publish`,
    },
  }
}

/** The four snippets the integration guide shows; the route loader highlights them. */
export function buildIntegrationSnippets({
  app,
  channelName,
  feedUrl,
  serverUrl,
}: {
  app: PublicApp
  channelName: string
  feedUrl: string
  serverUrl: string
}): Record<keyof IntegrationSnippets, { code: string; lang: HighlightLang }> {
  if (app.updaterKind === 'tauri') {
    return tauriSnippets({ app, channelName, feedUrl, serverUrl })
  }
  if (app.updaterKind === 'sparkle') {
    return sparkleSnippets({ app, channelName, feedUrl, serverUrl })
  }
  return electronSnippets({ app, channelName, feedUrl, serverUrl })
}
