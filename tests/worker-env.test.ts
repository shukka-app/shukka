import { describe, expect, it } from 'vitest'
import { applyWorkerEnv } from '~/lib/worker-env.ts'

describe('applyWorkerEnv', () => {
  it('copies string bindings onto process.env and ignores non-strings', () => {
    const previous = process.env.SHUKKA_DB_URL
    try {
      delete process.env.SHUKKA_DB_URL
      applyWorkerEnv({
        SHUKKA_DB_URL: 'libsql://example.turso.io',
        SHUKKA_ENCRYPTION_KEY: 'ab'.repeat(32),
        IGNORED: 1,
      })
      expect(process.env.SHUKKA_DB_URL).toBe('libsql://example.turso.io')
      expect(process.env.SHUKKA_ENCRYPTION_KEY).toBe('ab'.repeat(32))
    } finally {
      if (previous === undefined) delete process.env.SHUKKA_DB_URL
      else process.env.SHUKKA_DB_URL = previous
    }
  })
})
