import { describe, expect, it } from 'vitest'
import { SECURITY_HEADERS, withSecurityHeaders } from '~/lib/security-headers.ts'

describe('withSecurityHeaders', () => {
  it('preserves a JSON response while adding every hardening header', async () => {
    const hardened = withSecurityHeaders(Response.json({ ok: true }))

    expect(hardened.status).toBe(200)
    await expect(hardened.json()).resolves.toEqual({ ok: true })
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(hardened.headers.get(name)).toBe(value)
    }
  })

  it('preserves redirects while adding every hardening header', () => {
    const hardened = withSecurityHeaders(
      new Response(null, { status: 302, headers: { location: 'https://s3.test/x' } }),
    )

    expect(hardened.status).toBe(302)
    expect(hardened.headers.get('location')).toBe('https://s3.test/x')
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(hardened.headers.get(name)).toBe(value)
    }
  })

  it('overwrites existing hardening header values', () => {
    const hardened = withSecurityHeaders(
      new Response(null, { headers: { 'x-frame-options': 'SAMEORIGIN' } }),
    )

    expect(hardened.headers.get('x-frame-options')).toBe('DENY')
  })
})
