import { createClientOnlyFn } from '@tanstack/react-start'
import { useEffect, useState, type ComponentType } from 'react'
import { Skeleton } from '~/components/ui/skeleton'

type NotesEditorProps = {
  defaultValue: string
  placeholder: string
  onChange: (markdown: string) => void
}

/**
 * Start strips this to a throw-stub on the server, so Vite's Worker SSR
 * graph never sees the Crepe module. A route-level `React.lazy()` of a
 * milkdown importer still puts Crepe in that graph.
 */
const loadNotesEditorCrepe = createClientOnlyFn(() => import('./notes-editor-crepe.tsx'))

/**
 * Client-only shell for the Crepe editor. This file must not top-level-import
 * `@milkdown/*`.
 */
export function NotesEditor(props: NotesEditorProps) {
  const [Editor, setEditor] = useState<ComponentType<NotesEditorProps> | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadNotesEditorCrepe().then((mod) => {
      if (!cancelled) setEditor(() => mod.NotesEditorCrepe)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!Editor) return <Skeleton className="h-64 rounded-xl" />
  return <Editor {...props} />
}
