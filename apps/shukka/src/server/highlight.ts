import bash from '@shikijs/langs/bash'
import json from '@shikijs/langs/json'
import jsonc from '@shikijs/langs/jsonc'
import swift from '@shikijs/langs/swift'
import ts from '@shikijs/langs/ts'
import xml from '@shikijs/langs/xml'
import yaml from '@shikijs/langs/yaml'
import githubDarkDefault from '@shikijs/themes/github-dark-default'
import githubLightDefault from '@shikijs/themes/github-light-default'
import { createHighlighterCore } from 'shiki/core'
import { createOnigurumaEngine } from 'shiki/engine/oniguruma'

/**
 * Panel snippets are highlighted so the first paint is already colored.
 * Fine-grained `shiki/core` imports only the themes and langs the snippets
 * use; the highlighter (and the per-snippet HTML) is cached for the process
 * (or tab) lifetime. Used by the route loader on the server and by the
 * client fallback when the loader had no snippets.
 */
const highlighterPromise = createHighlighterCore({
  themes: [githubLightDefault, githubDarkDefault],
  langs: [yaml, bash, ts, json, jsonc, xml, swift],
  engine: createOnigurumaEngine(import('shiki/wasm')),
})

const htmlCache = new Map<string, string>()

export type HighlightLang = 'yaml' | 'bash' | 'ts' | 'json' | 'jsonc' | 'xml' | 'swift'

export async function highlightSnippet(code: string, lang: HighlightLang): Promise<string> {
  const key = `${lang}${code}`
  const cached = htmlCache.get(key)
  if (cached) return cached
  const highlighter = await highlighterPromise
  const html = highlighter.codeToHtml(code, {
    lang,
    themes: { light: 'github-light-default', dark: 'github-dark-default' },
  })
  htmlCache.set(key, html)
  return html
}
