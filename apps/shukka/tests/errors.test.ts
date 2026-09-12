import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShukkaError, jsonError } from '~/lib/errors.ts'

describe('jsonError', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not leak unexpected Error messages', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = jsonError(new Error('ENOENT: /etc/passwd'))
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({
      error: 'internal_error',
      message: 'Unexpected error',
    })
  })

  it('returns the ShukkaError message unchanged', async () => {
    const response = jsonError(new ShukkaError('not_found', 'App missing'))
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({
      error: 'not_found',
      message: 'App missing',
    })
  })
})
