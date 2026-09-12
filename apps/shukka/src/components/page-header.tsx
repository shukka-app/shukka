import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'

function useMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}

const HEADER_SLOT_ID = 'page-header-slot'
const TABBAR_SLOT_ID = 'page-tabbar-slot'

/**
 * Layout-side mount points the routed pages render into. Both live inside the
 * panel's single fixed blurred band so the page title and any tab bar share
 * one continuous backdrop (no seam between two backdrop-filter layers).
 */
export function PageHeaderSlot() {
  return (
    <>
      <div id={HEADER_SLOT_ID} />
      <div id={TABBAR_SLOT_ID} />
    </>
  )
}

/**
 * Renders into the fixed header slot in the panel layout (via a portal) so the
 * title stays pinned while page content scrolls. Falls back to inline rendering
 * when no slot is present (e.g. outside the panel).
 */
export function PageHeader({ title, back, children }: { title: string; back?: ReactNode; children?: ReactNode }) {
  const content = (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-4 pb-4">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {back ? (
          <span className="flex items-center gap-1.5 self-center text-sm text-muted-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            {back}
          </span>
        ) : null}
        <h1 className="text-2xl tracking-tight text-balance">{title}</h1>
      </div>
      {children ? <div className="flex gap-2">{children}</div> : null}
    </div>
  )

  const mounted = useMounted()
  const slot = mounted ? document.getElementById(HEADER_SLOT_ID) : null
  return slot ? createPortal(content, slot) : content
}

/**
 * Renders a page-level tab bar into the same fixed blurred band as the header,
 * directly beneath the title, so the two read as one surface when scrolled.
 * Falls back to inline rendering when no slot is present.
 */
export function PageTabBar({ children }: { children?: ReactNode }) {
  const mounted = useMounted()
  const slot = mounted ? document.getElementById(TABBAR_SLOT_ID) : null
  const content = <div className="-mx-5 border-b px-5">{children}</div>
  return slot ? createPortal(content, slot) : content
}
