import { toString } from 'mdast-util-to-string'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'

const textProcessor = unified().use(remarkParse).use(remarkGfm)

type MdastNode = { type: string; value?: string; children?: MdastNode[] }

/** Raw HTML never reaches the plain-text form, mirroring the sanitized html. */
function dropRawHtml<T extends MdastNode>(node: T): T {
  if (!node.children) return node
  return { ...node, children: node.children.filter((child) => child.type !== 'html').map((child) => dropRawHtml(child)) }
}

/**
 * Write-time renderer for release notes (ADR: release-log). `html` is
 * sanitized — notes are embedded in Electron update dialogs, so raw HTML in
 * the markdown source is stripped, not escaped. Reads never re-render.
 */
export function renderMarkdown(markdown: string): { html: string; text: string } {
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype)
      .use(rehypeSanitize)
      .use(rehypeStringify)
      .processSync(markdown),
  )
  const text = toString(dropRawHtml(textProcessor.runSync(textProcessor.parse(markdown)) as MdastNode)).trim()
  return { html, text }
}
