/**
 * Panel view roles. Pure presentation filter — the role only hides UI entry
 * points, it is not authorization: the server never stores or checks it, and
 * direct URL access is never blocked. Per-browser, stored in a cookie so SSR
 * renders the footer role label on first paint.
 */
export type ViewRole = 'admin' | 'developer' | 'content'

export const ROLE_COOKIE = 'shukka_role'
const ROLE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const DEFAULT_ROLE: ViewRole = 'admin'

export function isViewRole(value: string | null | undefined): value is ViewRole {
  return value === 'admin' || value === 'developer' || value === 'content'
}

/** Resolution chain: stored cookie, then the default (admin). */
export function resolveRole(fromCookie: string | null | undefined): ViewRole {
  return isViewRole(fromCookie) ? fromCookie : DEFAULT_ROLE
}

/** Create-app entry points are visible to admin and developer, hidden from content. */
export function canCreateApp(role: ViewRole): boolean {
  return role !== 'content'
}

/** Promote / make-current is visible to admin and developer, hidden from content. */
export function canPromote(role: ViewRole): boolean {
  return role !== 'content'
}

/** Version installer download is visible to admin and developer, hidden from content. */
export function canDownloadInstallers(role: ViewRole): boolean {
  return role !== 'content'
}

/** Release-notes editing entries are visible to admin and content, hidden from developer. */
export function canEditReleaseNotes(role: ViewRole): boolean {
  return role !== 'developer'
}

/** Traffic stats (channel trend chart, per-version stats dialog) are visible to admin and content. */
export function canSeeTrafficStats(role: ViewRole): boolean {
  return role !== 'developer'
}

/** Server side: read the role preference from the request cookie header. */
export function getRoleCookie(request: Request): ViewRole | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === ROLE_COOKIE) {
      const value = decodeURIComponent(rest.join('='))
      return isViewRole(value) ? value : null
    }
  }
  return null
}

/** Client side: persist the choice so the next SSR pass renders it directly. */
export function setRoleCookie(role: ViewRole): void {
  document.cookie = `${ROLE_COOKIE}=${role}; Path=/; SameSite=Lax; Max-Age=${ROLE_COOKIE_MAX_AGE}`
}
