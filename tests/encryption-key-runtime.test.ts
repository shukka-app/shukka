import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

const runtimeState = vi.hoisted(() => ({ cloud: false }))

vi.mock('~/lib/runtime.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/runtime.ts')>()
  return {
    ...actual,
    isCloudFunction: () => runtimeState.cloud,
  }
})

const { loadEncryptionKey } = await import('~/lib/crypto.ts')

const KEY_ENV = ['SHUKKA_ENCRYPTION_KEY', 'SHUKKA_ENCRYPTION_KEY_FILEPATH', 'SHUKKA_KEY_PATH'] as const

describe('encryption key on cloud isolates', () => {
  const saved = Object.fromEntries(KEY_ENV.map((name) => [name, process.env[name]]))

  afterEach(() => {
    runtimeState.cloud = false
    for (const name of KEY_ENV) {
      if (saved[name] === undefined) delete process.env[name]
      else process.env[name] = saved[name]
    }
  })

  it('requires SHUKKA_ENCRYPTION_KEY and rejects filepath', () => {
    runtimeState.cloud = true
    for (const name of KEY_ENV) delete process.env[name]
    expect(() => loadEncryptionKey()).toThrow(/SHUKKA_ENCRYPTION_KEY is required on cloud isolates/)

    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = '/tmp/unused.key'
    expect(() => loadEncryptionKey()).toThrow(/not supported on cloud isolates/)

    const hex = randomBytes(32).toString('hex')
    delete process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH
    process.env.SHUKKA_ENCRYPTION_KEY = hex
    expect(loadEncryptionKey().equals(Buffer.from(hex, 'hex'))).toBe(true)
  })
})
