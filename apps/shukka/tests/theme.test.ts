import { describe, expect, it } from 'vitest'
import { THEME_COOKIE, readThemeCookie } from '~/lib/theme.ts'

const requestWithCookie = (cookie: string) => new Request('https://shukka.test/settings', { headers: { cookie } })

describe('theme preference cookie', () => {
  it('reads a pinned theme out of a request', () => {
    expect(readThemeCookie(requestWithCookie(`other=1; ${THEME_COOKIE}=dark; trailing=2`))).toBe('dark')
    expect(readThemeCookie(requestWithCookie(`${THEME_COOKIE}=light`))).toBe('light')
  })

  it('treats a missing or unknown value as follow-the-system', () => {
    expect(readThemeCookie(new Request('https://shukka.test/settings'))).toBeNull()
    expect(readThemeCookie(requestWithCookie(`${THEME_COOKIE}=solarized`))).toBeNull()
  })
})
