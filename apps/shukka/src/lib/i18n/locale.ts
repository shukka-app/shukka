/**
 * Panel UI locales. `en` is the source and fallback language; the preference is
 * per-browser, stored in a cookie so SSR renders the right language on first paint.
 */
export type Locale = 'en' | 'zh'

/** BCP-47 tags for `<html lang>` and Intl formatters. */
export const localeTags: Record<Locale, string> = { en: 'en', zh: 'zh-CN' }

export const LOCALE_COOKIE = 'shukka_locale'
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'zh'
}

/** Resolution chain: stored cookie, then browser language, then English. */
export function resolveLocale(fromCookie: string | null | undefined, fromNavigator?: string | null): Locale {
  if (isLocale(fromCookie)) return fromCookie
  if (fromNavigator?.toLowerCase().startsWith('zh')) return 'zh'
  return 'en'
}

/** Server side: read the locale preference from the request cookie header. */
export function getLocaleCookie(request: Request): Locale | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === LOCALE_COOKIE) {
      const value = decodeURIComponent(rest.join('='))
      return isLocale(value) ? value : null
    }
  }
  return null
}

/** Client side: persist the choice so the next SSR pass renders it directly. */
export function setLocaleCookie(locale: Locale): void {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; SameSite=Lax; Max-Age=${LOCALE_COOKIE_MAX_AGE}`
}
