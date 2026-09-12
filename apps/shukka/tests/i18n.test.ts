import { describe, expect, it } from 'vitest'
import { ApiError } from '~/lib/api.ts'
import { formatChartDay, formatChartHour, formatDate, formatNumber, formatWhen } from '~/lib/format.ts'
import { en } from '~/lib/i18n/en.ts'
import { translateError } from '~/lib/i18n/errors.ts'
import { LOCALE_COOKIE, getLocaleCookie, resolveLocale } from '~/lib/i18n/locale.ts'
import { zh } from '~/lib/i18n/zh.ts'

describe('resolveLocale', () => {
  it('prefers the stored cookie over the browser language', () => {
    expect(resolveLocale('zh', 'en-US')).toBe('zh')
    expect(resolveLocale('en', 'zh-CN')).toBe('en')
  })

  it('falls back to the browser language, then English', () => {
    expect(resolveLocale(null, 'zh-CN')).toBe('zh')
    expect(resolveLocale(undefined, 'zh-Hans-CN')).toBe('zh')
    expect(resolveLocale(null, 'en-US')).toBe('en')
    expect(resolveLocale(null, 'fr-FR')).toBe('en')
    expect(resolveLocale(null)).toBe('en')
  })

  it('ignores invalid cookie values', () => {
    expect(resolveLocale('fr')).toBe('en')
  })
})

describe('getLocaleCookie', () => {
  it('reads the locale cookie from the request', () => {
    const request = new Request('http://localhost', { headers: { cookie: `a=1; ${LOCALE_COOKIE}=zh; b=2` } })
    expect(getLocaleCookie(request)).toBe('zh')
  })

  it('returns null without a header or a valid value', () => {
    expect(getLocaleCookie(new Request('http://localhost'))).toBeNull()
    const request = new Request('http://localhost', { headers: { cookie: `${LOCALE_COOKIE}=fr` } })
    expect(getLocaleCookie(request)).toBeNull()
  })
})

describe('dictionaries', () => {
  function keyPaths(value: unknown, prefix = ''): string[] {
    if (typeof value !== 'object' || value === null) return [prefix]
    return Object.entries(value).flatMap(([key, entry]) => keyPaths(entry, prefix ? `${prefix}.${key}` : key))
  }

  it('zh mirrors the en key tree', () => {
    expect(keyPaths(zh)).toEqual(keyPaths(en))
  })

  it('translates every fixed error code in both languages', () => {
    const codes = [
      'unauthorized',
      'forbidden',
      'not_found',
      'conflict',
      'invalid_request',
      'storage_error',
      'metadata_error',
      'rate_limited',
      'internal_error',
    ] as const
    for (const code of codes) {
      expect(en.errors[code]).toBeTruthy()
      expect(zh.errors[code]).toBeTruthy()
    }
  })
})

describe('translateError', () => {
  it('translates known codes into the active language', () => {
    const cause = new ApiError(401, 'unauthorized', 'Incorrect password')
    expect(translateError(en, cause, 'Login failed')).toBe(en.errors.unauthorized)
    expect(translateError(zh, cause, '登录失败')).toBe(zh.errors.unauthorized)
  })

  it('falls back to the server message for unknown codes', () => {
    const cause = new ApiError(500, 'weird_code', 'Server said no')
    expect(translateError(zh, cause, '请求失败')).toBe('Server said no')
  })

  it('uses the fallback for non-API errors', () => {
    expect(translateError(zh, new Error('boom'), '请求失败')).toBe('请求失败')
  })
})

describe('formatWhen', () => {
  const now = Math.floor(Date.now() / 1000)

  it('renders relative time per locale', () => {
    expect(formatWhen(now - 3 * 86400, { locale: 'en', justNow: en.common.justNow })).toBe('3 days ago')
    expect(formatWhen(now - 3 * 86400, { locale: 'zh-CN', justNow: zh.common.justNow })).toBe('3天前')
  })

  it('uses the dictionary justNow label', () => {
    expect(formatWhen(now - 5, { locale: 'en', justNow: en.common.justNow })).toBe('just now')
    expect(formatWhen(now - 5, { locale: 'zh-CN', justNow: zh.common.justNow })).toBe('刚刚')
  })

  it('falls back to a plain date beyond a week', () => {
    const old = now - 30 * 86400
    expect(formatWhen(old, { locale: 'en', justNow: en.common.justNow })).toBe(formatDate(old, 'en'))
  })
})

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567')
    expect(formatNumber(1234567, 'zh-CN')).toBe('1,234,567')
  })
})

describe('chart label formatters', () => {
  // 23:30 UTC is already the next day in timezones east of UTC, so a
  // browser-local label would disagree with the UTC bucketing.
  const lateUtc = Date.UTC(2026, 0, 2, 23, 30) / 1000

  it('pins day and hour labels to UTC', () => {
    expect(formatChartDay(lateUtc, 'en')).toBe('Jan 2')
    expect(formatChartHour(lateUtc, 'en')).toBe('23:30')
  })
})
