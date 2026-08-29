import { useEffect, useState, type ComponentType } from 'react'
import { Skeleton } from '~/components/ui/skeleton'

type NotesEditorProps = {
  defaultValue: string
  placeholder: string
  onChange: (markdown: string) => void
}

/**
 * Client-only shell for the Crepe editor. This file must not top-level-import
 * `@milkdown/*` — a route-level `React.lazy()` of a milkdown module still
 * puts Crepe in the Worker SSR graph.
 */
export function NotesEditor(props: NotesEditorProps) {
  const [Editor, setEditor] = useState<ComponentType<NotesEditorProps> | null>(null)

  useEffect(() => {
    let cancelled = false
    void import('./notes-editor-crepe.tsx').then((mod) => {
      if (!cancelled) setEditor(() => mod.NotesEditorCrepe)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Editor) return <Skeleton className="h-64 rounded-xl" />
  return <Editor {...props} />
}
