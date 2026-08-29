import { createHighlighter } from 'shiki'

/**
 * Panel snippets are highlighted on the server so the client never ships the
 * grammars and the first paint is already colored. The highlighter (and the
 * per-snippet HTML) is cached for the process lifetime: snippets are short,
 * few, and only change on deploy.
 */
const highlighterPromise = createHighlighter({
  themes: ['github-light-default', 'github-dark-default'],
  langs: ['yaml', 'bash', 'ts', 'json', 'jsonc', 'xml', 'swift'],
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
