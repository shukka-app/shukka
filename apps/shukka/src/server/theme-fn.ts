import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { readThemeCookie, type Theme } from '~/lib/theme.ts'

/** SSR read of the pinned theme so the first HTML already carries the right `<html>` class. */
export const getThemePreference = createServerFn({ method: 'GET' }).handler(async (): Promise<Theme | null> => {
  return readThemeCookie(getRequest())
})
