import { useContext, useMemo } from 'react'
import { formatChartDay, formatChartHour, formatDate, formatDateTime, formatNumber, formatWhen } from '~/lib/format.ts'
import { I18nContext, type I18nContextValue } from './context.ts'
import type { Dictionary } from './en.ts'
import { localeTags, type Locale } from './locale.ts'

function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('i18n hooks must be used within I18nProvider')
  return context
}

/** The active dictionary. */
export function useT(): Dictionary {
  return useI18n().t
}

export function useLocale(): Locale {
  return useI18n().locale
}

export function useSetLocale(): (locale: Locale) => void {
  return useI18n().setLocale
}

/** Date and relative-time formatters bound to the active locale and dictionary. */
export function useFormatters() {
  const { locale, t } = useI18n()
  const tag = localeTags[locale]
  return useMemo(() => {
    const displayNames = new Intl.DisplayNames([tag], { type: 'language' })
    return {
      when: (unixSeconds: number) => formatWhen(unixSeconds, { locale: tag, justNow: t.common.justNow }),
      date: (unixSeconds: number) => formatDate(unixSeconds, tag),
      dateTime: (unixSeconds: number) => formatDateTime(unixSeconds, tag),
      number: (value: number) => formatNumber(value, tag),
      chartDay: (unixSeconds: number) => formatChartDay(unixSeconds, tag),
      chartHour: (unixSeconds: number) => formatChartHour(unixSeconds, tag),
      /** Localized name for a BCP-47 tag (e.g. "English (United States)"); falls back to the tag. */
      localeName: (localeTag: string) => displayNames.of(localeTag) ?? localeTag,
    }
  }, [tag, t])
}
