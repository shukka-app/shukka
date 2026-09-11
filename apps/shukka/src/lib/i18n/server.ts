import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getLocaleCookie, resolveLocale, type Locale } from './locale.ts'

/** Read during SSR so the first paint already renders the stored locale. */
export const getLocalePreference = createServerFn({ method: 'GET' }).handler(async (): Promise<Locale> => {
  return resolveLocale(getLocaleCookie(getRequest()))
})
