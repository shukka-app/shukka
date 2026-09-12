import './setup-db.ts'
import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  loadEncryptionKey,
  PBKDF2_ITERATIONS,
  verifyPassword,
} from '~/lib/crypto.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { testDataDir } from './setup-db.ts'

const KEY_ENV = ['SHUKKA_ENCRYPTION_KEY', 'SHUKKA_ENCRYPTION_KEY_FILEPATH', 'SHUKKA_KEY_PATH'] as const

function snapshotKeyEnv() {
  return Object.fromEntries(KEY_ENV.map((name) => [name, process.env[name]])) as Record<
    (typeof KEY_ENV)[number],
    string | undefined
  >
}

function restoreKeyEnv(snapshot: ReturnType<typeof snapshotKeyEnv>) {
  for (const name of KEY_ENV) {
    if (snapshot[name] === undefined) delete process.env[name]
    else process.env[name] = snapshot[name]
  }
}

function unsetKeyEnv() {
  for (const name of KEY_ENV) delete process.env[name]
}

function hexKey() {
  return randomBytes(32).toString('hex')
}


describe('secret handling', () => {
  it('round-trips S3 secrets without storing plaintext', () => {
    const secret = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'
    const encrypted = encryptSecret(secret)
    expect(encrypted).not.toContain(secret)
    expect(decryptSecret(encrypted)).toBe(secret)
  })

  it('produces a different ciphertext each time', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptSecret('secret')
    const [iv, tag, body] = encrypted.split('.')
    expect(() => decryptSecret([iv, tag, `${body.slice(0, -4)}AAAA`].join('.'))).toThrow(ShukkaError)
  })

  it('throws storage_error for a garbage payload', () => {
    expect(() => decryptSecret('not-a-secret')).toThrow(ShukkaError)
    try {
      decryptSecret('not-a-secret')
    } catch (error) {
      expect(error).toBeInstanceOf(ShukkaError)
      expect((error as ShukkaError).code).toBe('storage_error')
      expect((error as ShukkaError).message).toBe('Stored S3 secret cannot be decrypted')
    }
  })

  it('throws storage_error when the ciphertext cannot be deciphered', () => {
    const encrypted = encryptSecret('secret')
    const [iv, tag, body] = encrypted.split('.')
    const broken = [iv, tag, `${body.slice(0, -4)}AAAA`].join('.')
    expect(() => decryptSecret(broken)).toThrow(ShukkaError)
    try {
      decryptSecret(broken)
    } catch (error) {
      expect(error).toBeInstanceOf(ShukkaError)
      expect((error as ShukkaError).code).toBe('storage_error')
      expect((error as ShukkaError).message).toBe('Stored S3 secret cannot be decrypted')
      expect((error as ShukkaError).message).not.toContain(broken)
    }
  })

  it('verifies passwords against their stored hash only', () => {
    const stored = hashPassword('correct horse battery', 'scrypt')
    expect(stored).not.toContain('correct horse battery')
    expect(stored.startsWith('scrypt$')).toBe(true)
    expect(verifyPassword('correct horse battery', stored)).toBe(true)
    expect(verifyPassword('wrong', stored)).toBe(false)
  })

  it('writes and verifies pbkdf2$<iters>$<salt>$<hex> without changing scrypt$ verify', () => {
    const scryptStored = hashPassword('correct horse battery', 'scrypt')
    const pbkdf2Stored = hashPassword('correct horse battery', 'pbkdf2')

    expect(scryptStored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/)
    expect(pbkdf2Stored).toMatch(new RegExp(`^pbkdf2\\$${PBKDF2_ITERATIONS}\\$[0-9a-f]{32}\\$[0-9a-f]{64}$`))
    expect(verifyPassword('correct horse battery', scryptStored)).toBe(true)
    expect(verifyPassword('correct horse battery', pbkdf2Stored)).toBe(true)
    expect(verifyPassword('wrong', pbkdf2Stored)).toBe(false)
  })

  it('verifies a pbkdf2$ hash using the iteration count stored in the string', () => {
    const salt = randomBytes(16)
    const iterations = 1_000
    const derived = pbkdf2Sync('correct horse battery', salt, iterations, 32, 'sha256')
    const stored = `pbkdf2$${iterations}$${salt.toString('hex')}$${derived.toString('hex')}`
    expect(verifyPassword('correct horse battery', stored)).toBe(true)
    expect(verifyPassword('wrong', stored)).toBe(false)
  })

  it('rejects unknown or malformed password hashes', () => {
    expect(verifyPassword('pw', 'argon2$abc$def')).toBe(false)
    expect(verifyPassword('pw', 'scrypt$zz$00')).toBe(false)
    expect(verifyPassword('pw', 'pbkdf2$not-a-number$aa$bb')).toBe(false)
    expect(verifyPassword('pw', `pbkdf2$${PBKDF2_ITERATIONS}$aa`)).toBe(false)
  })
})

describe('encryption key sources', () => {
  const saved = snapshotKeyEnv()
  const defaultKeyPath = join(testDataDir, 'encryption.key')

  afterEach(() => {
    restoreKeyEnv(saved)
  })

  it('generates {data}/encryption.key when neither source is set', () => {
    unsetKeyEnv()
    rmSync(defaultKeyPath, { force: true })

    const key = loadEncryptionKey()
    expect(key).toHaveLength(32)
    expect(existsSync(defaultKeyPath)).toBe(true)
    expect(readFileSync(defaultKeyPath, 'utf8').trim()).toBe(key.toString('hex'))
    expect(loadEncryptionKey().equals(key)).toBe(true)
  })

  it('reads SHUKKA_ENCRYPTION_KEY_FILEPATH and does not write the data-dir key', () => {
    const hex = hexKey()
    const dir = mkdtempSync(join(tmpdir(), 'shukka-key-'))
    const filepath = join(dir, 'custom.key')
    writeFileSync(filepath, `${hex}\n`)

    unsetKeyEnv()
    rmSync(defaultKeyPath, { force: true })
    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = filepath

    const key = loadEncryptionKey()
    expect(key.equals(Buffer.from(hex, 'hex'))).toBe(true)
    expect(existsSync(defaultKeyPath)).toBe(false)

    rmSync(dir, { recursive: true, force: true })
  })

  it('reads SHUKKA_ENCRYPTION_KEY and never writes a key file', () => {
    const hex = hexKey()
    unsetKeyEnv()
    rmSync(defaultKeyPath, { force: true })
    process.env.SHUKKA_ENCRYPTION_KEY = hex

    const key = loadEncryptionKey()
    expect(key.equals(Buffer.from(hex, 'hex'))).toBe(true)
    expect(existsSync(defaultKeyPath)).toBe(false)
  })

  it('refuses to start when value and filepath are both set', () => {
    unsetKeyEnv()
    process.env.SHUKKA_ENCRYPTION_KEY = hexKey()
    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = join(tmpdir(), 'unused.key')
    expect(() => loadEncryptionKey()).toThrow(/Set only one of SHUKKA_ENCRYPTION_KEY/)
  })

  it('refuses to start when value and deprecated SHUKKA_KEY_PATH are both set', () => {
    unsetKeyEnv()
    process.env.SHUKKA_ENCRYPTION_KEY = hexKey()
    process.env.SHUKKA_KEY_PATH = join(tmpdir(), 'unused.key')
    expect(() => loadEncryptionKey()).toThrow(/Set only one of SHUKKA_ENCRYPTION_KEY/)
  })

  it('refuses when FILEPATH and SHUKKA_KEY_PATH disagree', () => {
    unsetKeyEnv()
    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = '/tmp/a.key'
    process.env.SHUKKA_KEY_PATH = '/tmp/b.key'
    expect(() => loadEncryptionKey()).toThrow(/SHUKKA_KEY_PATH disagree/)
  })

  it('accepts FILEPATH and SHUKKA_KEY_PATH when they name the same file', () => {
    const hex = hexKey()
    const dir = mkdtempSync(join(tmpdir(), 'shukka-key-'))
    const filepath = join(dir, 'same.key')
    writeFileSync(filepath, hex)

    unsetKeyEnv()
    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = filepath
    process.env.SHUKKA_KEY_PATH = filepath

    expect(loadEncryptionKey().equals(Buffer.from(hex, 'hex'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('still reads the deprecated SHUKKA_KEY_PATH alias', () => {
    const hex = hexKey()
    const dir = mkdtempSync(join(tmpdir(), 'shukka-key-'))
    const filepath = join(dir, 'alias.key')
    writeFileSync(filepath, hex)

    unsetKeyEnv()
    process.env.SHUKKA_KEY_PATH = filepath

    expect(loadEncryptionKey().equals(Buffer.from(hex, 'hex'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('refuses an empty or invalid hex value', () => {
    unsetKeyEnv()
    process.env.SHUKKA_ENCRYPTION_KEY = ''
    expect(() => loadEncryptionKey()).toThrow(/SHUKKA_ENCRYPTION_KEY is empty/)

    process.env.SHUKKA_ENCRYPTION_KEY = '   '
    expect(() => loadEncryptionKey()).toThrow(/SHUKKA_ENCRYPTION_KEY is empty/)

    process.env.SHUKKA_ENCRYPTION_KEY = 'not-hex'
    expect(() => loadEncryptionKey()).toThrow(/64 hex characters/)

    process.env.SHUKKA_ENCRYPTION_KEY = 'aa'
    expect(() => loadEncryptionKey()).toThrow(/64 hex characters/)

    process.env.SHUKKA_ENCRYPTION_KEY = 'g'.repeat(64)
    expect(() => loadEncryptionKey()).toThrow(/64 hex characters/)
  })

  it('refuses an empty filepath, a missing file, or invalid hex in the file', () => {
    unsetKeyEnv()
    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = ''
    expect(() => loadEncryptionKey()).toThrow(/SHUKKA_ENCRYPTION_KEY_FILEPATH is empty/)

    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = join(tmpdir(), `missing-${Date.now()}.key`)
    expect(() => loadEncryptionKey()).toThrow(/S3 encryption key file not found/)

    const dir = mkdtempSync(join(tmpdir(), 'shukka-key-'))
    const filepath = join(dir, 'bad.key')
    writeFileSync(filepath, 'zzzz')
    process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH = filepath
    expect(() => loadEncryptionKey()).toThrow(/64 hex characters/)
    rmSync(dir, { recursive: true, force: true })
  })
})

