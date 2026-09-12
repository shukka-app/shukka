import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { I18nContext, dictionaries, type I18nContextValue } from './context.ts'
import { localeTags, setLocaleCookie, type Locale } from './locale.ts'

/**
 * Holds the active locale. Switching updates the dictionary, persists the
 * per-browser cookie, and keeps `<html lang>` in sync without a reload.
 */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale)
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    setLocaleCookie(next)
    document.documentElement.lang = localeTags[next]
  }, [])
  const value = useMemo<I18nContextValue>(() => ({ locale, t: dictionaries[locale], setLocale }), [locale, setLocale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
