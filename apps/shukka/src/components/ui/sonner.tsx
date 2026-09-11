import { useSyncExternalStore } from 'react'
import { Toaster as SonnerToaster } from 'sonner'

/** Effective theme = the class the pre-paint script / switcher put on <html>. */
function useEffectiveTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange)
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
      return () => observer.disconnect()
    },
    () => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
    () => 'light',
  )
}

export function Toaster() {
  const theme = useEffectiveTheme()
  return <SonnerToaster theme={theme} position="bottom-right" gap={8} />
}
