import { describe, expect, it } from 'vitest'
import { buildIntegrationSnippets } from '~/features/apps/integration-snippets.ts'
import type { PublicApp } from '~/server/dashboard.ts'

const electronApp = { slug: 'desk', updaterKind: 'electron' } as PublicApp
const tauriApp = { slug: 'desk', updaterKind: 'tauri' } as PublicApp

const args = {
  channelName: 'stable',
  feedUrl: 'https://updates.example.com/api/update/desk/stable',
  serverUrl: 'https://updates.example.com',
}

describe('buildIntegrationSnippets', () => {
  it('marks Tauri updater keys the user must fill and only injects the feed URL', () => {
    const snippets = buildIntegrationSnippets({ app: tauriApp, ...args })
    const config = snippets.builderConfig.code

    expect(snippets.builderConfig.lang).toBe('jsonc')
    expect(config).toContain(args.feedUrl)
    expect(config).toMatch(/you fill these; not Shukka/)
    expect(config).toContain('"pubkey": "<YOUR_TAURI_UPDATER_PUBKEY>"')
    expect(config).toContain('"createUpdaterArtifacts": true')
    expect(config).toContain('dangerousInsecureTransportProtocol')
    expect(config).toMatch(/HTTP feeds only/)
    expect(snippets.mainProcess.code).toMatch(/optional: await relaunch\(\)/)
  })

  it('leaves the Electron builder snippet as feed URL only', () => {
    const snippets = buildIntegrationSnippets({ app: electronApp, ...args })
    expect(snippets.builderConfig.lang).toBe('yaml')
    expect(snippets.builderConfig.code).toContain(`url: ${args.feedUrl}`)
    expect(snippets.builderConfig.code).not.toContain('pubkey')
    expect(snippets.builderConfig.code).not.toContain('createUpdaterArtifacts')
  })
})
