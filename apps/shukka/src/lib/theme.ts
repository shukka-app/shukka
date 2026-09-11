export type Theme = 'light' | 'dark'

export const THEME_COOKIE = 'shukka_theme'
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

declare global {
  interface Window {
    __shukkaThemeFollow?: () => void
  }
}

function parseThemeCookieHeader(header: string | null): Theme | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === THEME_COOKIE) {
      const value = decodeURIComponent(rest.join('='))
      return value === 'light' || value === 'dark' ? value : null
    }
  }
  return null
}

export function readThemeCookie(request: Request): Theme | null {
  return parseThemeCookieHeader(request.headers.get('cookie'))
}

export function getStoredTheme(): Theme | null {
  return parseThemeCookieHeader(document.cookie)
}

export function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

/*
 * Cookie semantics (ADR: panel-i18n-and-theme): only a theme that contradicts
 * the OS preference is pinned; choosing the system theme clears the cookie so
 * the panel follows the OS again. The pre-paint script's media listener is
 * attached/detached to match.
 */
export function setThemePreference(theme: Theme): void {
  const follow = window.__shukkaThemeFollow
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  if (theme === getSystemTheme()) {
    document.cookie = `${THEME_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0`
    if (follow) media.addEventListener('change', follow)
  } else {
    document.cookie = `${THEME_COOKIE}=${theme}; Path=/; SameSite=Lax; Max-Age=${THEME_COOKIE_MAX_AGE}`
    if (follow) media.removeEventListener('change', follow)
  }
  applyTheme(theme)
}

/*
 * Pre-paint resolver inlined into <head> by __root.tsx: a pinned cookie wins
 * (no media listener); without a cookie the OS preference is followed live.
 * Must stay self-contained — it ships as a string, not a module.
 */
export const THEME_INLINE_SCRIPT = `(function(){var d=document.documentElement;var m=matchMedia('(prefers-color-scheme: dark)');var c=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)(?:;|$)/);var a=function(t){d.classList.toggle('dark',t==='dark');d.style.colorScheme=t};var f=function(){a(m.matches?'dark':'light')};window.__shukkaThemeFollow=f;if(c){a(c[1])}else{f();m.addEventListener('change',f)}})()`
