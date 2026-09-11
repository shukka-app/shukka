import { describe, expect, it } from 'vitest'
import { DEFAULT_ROLE, ROLE_COOKIE, canCreateApp, canDownloadInstallers, canEditReleaseNotes, canPromote, canSeeTrafficStats, getRoleCookie, resolveRole } from '~/lib/role.ts'

const requestWithCookie = (cookie: string) => new Request('https://shukka.test/apps', { headers: { cookie } })

describe('view role cookie', () => {
  it('reads a stored role out of a request', () => {
    expect(getRoleCookie(requestWithCookie(`other=1; ${ROLE_COOKIE}=developer; trailing=2`))).toBe('developer')
    expect(getRoleCookie(requestWithCookie(`${ROLE_COOKIE}=content`))).toBe('content')
  })

  it('treats a missing or unknown value as unset', () => {
    expect(getRoleCookie(new Request('https://shukka.test/apps'))).toBeNull()
    expect(getRoleCookie(requestWithCookie(`${ROLE_COOKIE}=superuser`))).toBeNull()
  })

  it('resolves to admin by default and keeps valid roles', () => {
    expect(resolveRole(null)).toBe(DEFAULT_ROLE)
    expect(resolveRole('superuser')).toBe(DEFAULT_ROLE)
    expect(DEFAULT_ROLE).toBe('admin')
    expect(resolveRole('content')).toBe('content')
  })
})

describe('canCreateApp', () => {
  it('hides create-app entry points from content only', () => {
    expect(canCreateApp('content')).toBe(false)
    expect(canCreateApp('developer')).toBe(true)
    expect(canCreateApp('admin')).toBe(true)
  })
})

describe('canEditReleaseNotes', () => {
  it('hides release-notes entries from developer only', () => {
    expect(canEditReleaseNotes('developer')).toBe(false)
    expect(canEditReleaseNotes('content')).toBe(true)
    expect(canEditReleaseNotes('admin')).toBe(true)
  })
})

describe('canPromote', () => {
  it('hides promote from content only', () => {
    expect(canPromote('content')).toBe(false)
    expect(canPromote('developer')).toBe(true)
    expect(canPromote('admin')).toBe(true)
  })
})

describe('canDownloadInstallers', () => {
  it('hides installer download from content only', () => {
    expect(canDownloadInstallers('content')).toBe(false)
    expect(canDownloadInstallers('developer')).toBe(true)
    expect(canDownloadInstallers('admin')).toBe(true)
  })
})

describe('canSeeTrafficStats', () => {
  it('hides trend charts and version stats from developer only', () => {
    expect(canSeeTrafficStats('developer')).toBe(false)
    expect(canSeeTrafficStats('content')).toBe(true)
    expect(canSeeTrafficStats('admin')).toBe(true)
  })
})
