import { CrepeBuilder } from '@milkdown/crepe/builder'
import { blockEdit } from '@milkdown/crepe/feature/block-edit'
import { cursor } from '@milkdown/crepe/feature/cursor'
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip'
import { listItem } from '@milkdown/crepe/feature/list-item'
import { placeholder } from '@milkdown/crepe/feature/placeholder'
import { table } from '@milkdown/crepe/feature/table'
import { toolbar } from '@milkdown/crepe/feature/toolbar'
import { useEffect, useRef } from 'react'

// Structure styles only — colors/fonts come from the --crepe-* mapping in
// styles.css, so the editor follows the panel theme (ADR: release-log).
import '@milkdown/crepe/theme/common/style.css'

/**
 * WYSIWYG markdown editor (Milkdown CrepeBuilder). Word pastes arrive as
 * clipboard HTML and are parsed by ProseMirror; markdown source pastes are
 * detected and parsed by the bundled clipboard plugin. Remount (via React
 * `key`) to switch documents — Crepe has no setMarkdown.
 *
 * Features are added one import at a time so latex / image-block / code-mirror
 * stay out of the graph. Runtime `new Crepe({ features })` flags do not
 * tree-shake the monolith entry.
 */
export function NotesEditorCrepe({
  defaultValue,
  placeholder: placeholderText,
  onChange,
}: {
  defaultValue: string
  placeholder: string
  onChange: (markdown: string) => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const crepe = new CrepeBuilder({
      root,
      defaultValue,
    })
      .addFeature(placeholder, { text: placeholderText, mode: 'block' })
      .addFeature(toolbar)
      .addFeature(listItem)
      .addFeature(linkTooltip)
      .addFeature(cursor)
      .addFeature(blockEdit)
      .addFeature(table)
    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => onChangeRef.current(markdown))
    })
    // Serialize create → destroy: destroying before creation finishes races
    // the listener's debounced serializer (milkdown#2356).
    const created = crepe.create()
    return () => {
      void created.then(() => crepe.destroy()).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- remount via key, not props
  }, [])

  return <div ref={rootRef} />
}
