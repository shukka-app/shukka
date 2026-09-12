import { createContext } from 'react'
import { en, type Dictionary } from './en.ts'
import type { Locale } from './locale.ts'
import { zh } from './zh.ts'

export type I18nContextValue = {
  locale: Locale
  t: Dictionary
  setLocale: (locale: Locale) => void
}

export const dictionaries: Record<Locale, Dictionary> = { en, zh }

export const I18nContext = createContext<I18nContextValue | null>(null)
