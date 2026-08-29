import { Link } from '@tanstack/react-router'
import { BookOpen, Bot, Braces, Check, Sparkles, Workflow } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { CopyBlock } from '~/components/copy-block.tsx'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { copyText } from '~/lib/clipboard.ts'
import { useT } from '~/lib/i18n/index.ts'
import type { IntegrationSnippets, Snippet } from '~/features/apps/integration-snippets.ts'
import type { ChannelDetail, PublicApp } from '~/server/dashboard.ts'

/**
 * Ordered setup guide for the two integration points: the app reading the feed
 * and the pipeline publishing to it (GitHub Action or the raw HTTP API).
 */
export function IntegrationPanel({
  app,
  channels,
  snippets,
}: {
  app: PublicApp
  channels: ChannelDetail[]
  snippets: IntegrationSnippets
}) {
  const t = useT()
  // The default channel is what a fresh integration should point at.
  const channel = channels.find((entry) => entry.name === 'stable') ?? channels[0]
  const channelName = channel?.name ?? 'stable'
  const feedUrl = channel?.feedUrl ?? `https://your-shukka-host/api/update/${app.slug}/stable`
  const serverUrl = feedUrl.replace(/\/api\/update\/.*$/, '')

  const copy = app.updaterKind === 'tauri' ? t.integration.tauri : t.integration.electron
  const steps = [
    {
      title: copy.step1Title,
      detail: copy.step1Detail,
      snippet: snippets.builderConfig,
    },
    {
      title: copy.step2Title,
      detail: copy.step2Detail,
      snippet: snippets.mainProcess,
    },
  ]

  const actionPrompt =
    app.updaterKind === 'tauri'
      ? `Set up Tauri plugin-updater self-updates for this app using my Shukka instance.

Facts:
- Update feed (public, no auth): ${feedUrl}
- Channel: ${channelName}
- App slug: ${app.slug}
- Publishing goes through the Shukka GitHub Action (shukka-app/shukka@v1.0.2) with repository secrets SHUKKA_URL (my Shukka base URL) and SHUKKA_API_KEY (I will create it in the panel and add it to the repo myself — never ask me to paste it into code).

Do all of the following:
1. In tauri.conf, set plugins.updater.endpoints to the feed URL above (the channel-root URL, not a latest.json path). Shukka fills only that URL. You must also fill from official Tauri docs (not Shukka): bundle.createUpdaterArtifacts: true; plugins.updater.pubkey as the minisign public key string (not a file path); dangerousInsecureTransportProtocol: true only if the feed is HTTP — production must be HTTPS and omit that key. Generate keys with \`tauri signer generate\` and set TAURI_SIGNING_PRIVATE_KEY at build time. Ensure the updater:default capability is present (\`tauri add updater\` usually adds it).
2. Call check() from @tauri-apps/plugin-updater when the app should look for updates. downloadAndInstall() applies the update; relaunch() afterwards is optional (official Tauri docs).
3. Add a GitHub Actions workflow that builds the Tauri updater bundles and publishes that directory with the Shukka action (inputs: server-url, api-key, app, channel, directory, release). Pass release: true to go live immediately. Omitting it creates a draft the feed cannot see — promote later in the panel or PATCH /api/v1/apps/${app.slug}/channels/${channelName} { "currentVersion": "<version>" }.
4. Tell me what manual steps remain (creating the API key, adding the secrets, generating signer keys, embedding the pubkey, enabling createUpdaterArtifacts, choosing HTTPS vs the HTTP flag, granting updater:default). Do not invent Shukka substitutes for signing or bundling.`
      : `Set up electron-updater self-updates for this app using my Shukka instance.

Facts:
- Update feed (public, no auth): ${feedUrl}
- Channel: ${channelName}
- App slug: ${app.slug}
- Publishing goes through the Shukka GitHub Action (shukka-app/shukka@v1.0.2) with repository secrets SHUKKA_URL (my Shukka base URL) and SHUKKA_API_KEY (I will create it in the panel and add it to the repo myself — never ask me to paste it into code).

Do all of the following:
1. In electron-builder config, set publish to the generic provider pointing at the feed URL above. Do not set publish.channel — the feed URL already includes the Shukka channel.
2. In the Electron main process, configure electron-updater with that feed URL (no channel override) and call checkForUpdatesAndNotify() after app ready.
3. Add a GitHub Actions workflow that builds the electron-builder output and publishes the dist directory with the Shukka action (inputs: server-url, api-key, app, channel, directory, release). Pass release: true to go live immediately. Omitting it creates a draft the feed cannot see — promote later in the panel or PATCH /api/v1/apps/${app.slug}/channels/${channelName} { "currentVersion": "<version>" }.
4. Verify the config is coherent and tell me what manual steps remain (creating the API key, adding the secrets).`

  const httpApiPrompt =
    app.updaterKind === 'tauri'
      ? `Set up Tauri plugin-updater self-updates for this app using my Shukka instance, publishing over the raw HTTP API (no GitHub Action).

Facts:
- Update feed (public, no auth): ${feedUrl}
- Channel: ${channelName}
- App slug: ${app.slug}
- Shukka base URL: ${serverUrl}
- Authentication: header \`Authorization: Bearer shk_...\` — I will create the API key in the panel and provide it to the CI environment myself; never hardcode it.

Upload protocol (JSON bodies; errors are { "error": <code>, "message": <string> }):
1. POST ${serverUrl}/api/v1/upload/init with { "app": "${app.slug}", "channel": "${channelName}", "version": "<version>", "files": [{ "filename": "<name>", "size": <bytes> }, ...] } — the file list is the updater bundles plus matching .sig files, optionally latest.json. The response contains uploadId and, per file, a presigned uploadUrl.
2. PUT each file's raw bytes to its uploadUrl (direct to S3; URLs expire one hour after init).
3. POST ${serverUrl}/api/v1/upload/finalize with { "uploadId": "<id>", "app": "${app.slug}", "release": true } — Shukka verifies the objects. "release": true goes live in the same call. Omit it to create a draft the feed cannot see; promote later in the panel or PATCH /api/v1/apps/${app.slug}/channels/${channelName} { "currentVersion": "<version>" }.

Do all of the following:
1. In tauri.conf, set plugins.updater.endpoints to the feed URL above (the channel-root URL, not a latest.json path). Shukka fills only that URL. You must also fill from official Tauri docs (not Shukka): bundle.createUpdaterArtifacts: true; plugins.updater.pubkey as the minisign public key string (not a file path); dangerousInsecureTransportProtocol: true only if the feed is HTTP — production must be HTTPS and omit that key. Generate keys with \`tauri signer generate\` and set TAURI_SIGNING_PRIVATE_KEY at build time. Ensure the updater:default capability is present (\`tauri add updater\` usually adds it).
2. Call check() from @tauri-apps/plugin-updater when the app should look for updates. downloadAndInstall() applies the update; relaunch() afterwards is optional (official Tauri docs).
3. Write a publish script (or CI step) that follows the upload protocol above against the updater bundle directory.
4. Tell me what manual steps remain (creating the API key, wiring it into CI, generating signer keys, embedding the pubkey, enabling createUpdaterArtifacts, choosing HTTPS vs the HTTP flag, granting updater:default). Do not invent Shukka substitutes for signing or bundling.`
      : `Set up electron-updater self-updates for this app using my Shukka instance, publishing over the raw HTTP API (no GitHub Action).

Facts:
- Update feed (public, no auth): ${feedUrl}
- Channel: ${channelName}
- App slug: ${app.slug}
- Shukka base URL: ${serverUrl}
- Authentication: header \`Authorization: Bearer shk_...\` — I will create the API key in the panel and provide it to the CI environment myself; never hardcode it.

Upload protocol (JSON bodies; errors are { "error": <code>, "message": <string> }):
1. POST ${serverUrl}/api/v1/upload/init with { "app": "${app.slug}", "channel": "${channelName}", "version": "<version>", "files": [{ "filename": "<name>", "size": <bytes> }, ...] } — the file list is every file in the electron-builder output directory (installers, *.blockmap, latest*.yml) and must include at least one .yml. The response contains uploadId and, per file, a presigned uploadUrl.
2. PUT each file's raw bytes to its uploadUrl (direct to S3; URLs expire one hour after init).
3. POST ${serverUrl}/api/v1/upload/finalize with { "uploadId": "<id>", "app": "${app.slug}", "release": true } — Shukka verifies the objects and parses the yml. "release": true goes live in the same call. Omit it to create a draft the feed cannot see; promote later in the panel or PATCH /api/v1/apps/${app.slug}/channels/${channelName} { "currentVersion": "<version>" }.

Do all of the following:
1. In electron-builder config, set publish to the generic provider pointing at the feed URL above. Do not set publish.channel — the feed URL already includes the Shukka channel.
2. In the Electron main process, configure electron-updater with that feed URL (no channel override) and call checkForUpdatesAndNotify() after app ready.
3. Write a publish script (or CI step) that follows the upload protocol above against the electron-builder output directory, reading the version from the latest*.yml it contains.
4. Verify the config is coherent and tell me what manual steps remain (creating the API key, wiring it into CI).`

  return (
    <div className="max-w-3xl space-y-10">
      <ol className="space-y-10">
        {steps.map((step, index) => (
          <li key={step.title} className="grid gap-2.5">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-sm text-muted-foreground">0{index + 1}</span>
              <h3 className="text-base">{step.title}</h3>
            </div>
            <p className="pl-8 text-sm text-muted-foreground">{step.detail}</p>
            <div className="pl-8">
              <CopyBlock value={step.snippet.code} html={step.snippet.html} />
            </div>
          </li>
        ))}
      </ol>

      {app.updaterKind === 'tauri' ? (
        <p className="pl-8 text-sm text-muted-foreground">{t.integration.tauri.linuxNote}</p>
      ) : null}

      <section className="grid gap-2.5">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm text-muted-foreground">03</span>
          <h3 className="text-base">{t.integration.publishTitle}</h3>
        </div>
        <p className="pl-8 text-sm text-muted-foreground">{copy.publishDetail}</p>

        <Tabs defaultValue="action" className="mt-2.5 pl-8">
          <TabsList>
            <TabsTrigger value="action">
              <Workflow /> {t.integration.githubActionTitle}
            </TabsTrigger>
            <TabsTrigger value="http">
              <Braces /> {t.integration.httpApiTitle}
            </TabsTrigger>
            <TabsTrigger value="agent">
              <Bot /> {t.integration.agentTitle}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="action" className="mt-4">
            <PublishMethod
              detail={t.integration.githubActionDetail}
              snippet={snippets.githubAction}
              action={<CopyAgentPrompt value={actionPrompt} />}
            />
          </TabsContent>
          <TabsContent value="http" className="mt-4">
            <PublishMethod
              detail={t.integration.httpApiDetail}
              snippet={snippets.httpApi}
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/docs" target="_blank" rel="noreferrer">
                      <BookOpen />
                      {t.integration.openApiDocs}
                    </Link>
                  </Button>
                  <CopyAgentPrompt value={httpApiPrompt} />
                </div>
              }
            />
          </TabsContent>
          <TabsContent value="agent" className="mt-4">
            <PublishMethod detail={t.integration.agentDetail} snippet={snippets.agentCli} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}

/** One publish path: detail, copyable snippet, and an optional trailing action. */
function PublishMethod({
  detail,
  snippet,
  action,
}: {
  detail: string
  snippet: Snippet
  action?: ReactNode
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{detail}</p>
        {action}
      </div>
      <CopyBlock value={snippet.code} html={snippet.html} />
    </div>
  )
}

/** One-click handoff: copies a ready-made agent prompt for the whole pipeline. */
function CopyAgentPrompt({ value }: { value: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)

  async function copy() {
    const ok = await copyText(value)
    if (!ok) {
      toast.error(t.common.copyFailed)
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="text-success" /> : <Sparkles />}
      {t.integration.copyAgentPrompt}
    </Button>
  )
}
