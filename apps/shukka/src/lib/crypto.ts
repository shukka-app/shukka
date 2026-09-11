import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dataDir } from '~/db/index.ts'
import { ShukkaError } from '~/lib/errors.ts'
import { isCloudFunction } from '~/lib/runtime.ts'

const KEY_HEX_LENGTH = 64

function envPresent(name: string): boolean {
  return process.env[name] !== undefined
}

function parseHexKey(raw: string, source: string): Buffer {
  const hex = raw.trim()
  if (hex.length === 0) {
    throw new Error(`${source} is empty`)
  }
  if (hex.length !== KEY_HEX_LENGTH || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error(`${source} must be 64 hex characters (32 bytes)`)
  }
  return Buffer.from(hex, 'hex')
}

function readKeyFile(keyPath: string, source: string): Buffer {
  if (keyPath.trim() === '') {
    throw new Error(`${source} is empty`)
  }
  if (!existsSync(keyPath)) {
    throw new Error(`S3 encryption key file not found: ${keyPath}`)
  }
  return parseHexKey(readFileSync(keyPath, 'utf8'), source)
}

/**
 * Encryption key for S3 secrets. Default: generate `{data}/encryption.key` on first
 * boot. Optionally supply exactly one of SHUKKA_ENCRYPTION_KEY_FILEPATH (or the
 * deprecated alias SHUKKA_KEY_PATH) or SHUKKA_ENCRYPTION_KEY. See
 * docs/adr/encryption-key-source.md.
 */
export function loadEncryptionKey(): Buffer {
  if (isCloudFunction()) {
    if (envPresent('SHUKKA_ENCRYPTION_KEY_FILEPATH') || envPresent('SHUKKA_KEY_PATH')) {
      throw new Error(
        'SHUKKA_ENCRYPTION_KEY_FILEPATH is not supported on cloud isolates. Set SHUKKA_ENCRYPTION_KEY.',
      )
    }
    if (!envPresent('SHUKKA_ENCRYPTION_KEY')) {
      throw new Error('SHUKKA_ENCRYPTION_KEY is required on cloud isolates')
    }
    return parseHexKey(process.env.SHUKKA_ENCRYPTION_KEY ?? '', 'SHUKKA_ENCRYPTION_KEY')
  }

  const hasValue = envPresent('SHUKKA_ENCRYPTION_KEY')
  const hasFilepath = envPresent('SHUKKA_ENCRYPTION_KEY_FILEPATH')
  const hasAlias = envPresent('SHUKKA_KEY_PATH')

  if (hasValue && (hasFilepath || hasAlias)) {
    throw new Error(
      'Set only one of SHUKKA_ENCRYPTION_KEY or SHUKKA_ENCRYPTION_KEY_FILEPATH. SHUKKA_KEY_PATH is a deprecated alias of SHUKKA_ENCRYPTION_KEY_FILEPATH.',
    )
  }

  if (hasFilepath && hasAlias && process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH !== process.env.SHUKKA_KEY_PATH) {
    throw new Error(
      'SHUKKA_ENCRYPTION_KEY_FILEPATH and SHUKKA_KEY_PATH disagree (SHUKKA_KEY_PATH is a deprecated alias). Set only one, or set both to the same path.',
    )
  }

  if (hasValue) {
    return parseHexKey(process.env.SHUKKA_ENCRYPTION_KEY ?? '', 'SHUKKA_ENCRYPTION_KEY')
  }

  if (hasFilepath || hasAlias) {
    const source = hasFilepath ? 'SHUKKA_ENCRYPTION_KEY_FILEPATH' : 'SHUKKA_KEY_PATH'
    const keyPath = hasFilepath ? process.env.SHUKKA_ENCRYPTION_KEY_FILEPATH : process.env.SHUKKA_KEY_PATH
    return readKeyFile(keyPath ?? '', source)
  }

  const keyPath = resolve(dataDir, 'encryption.key')
  if (existsSync(keyPath)) return parseHexKey(readFileSync(keyPath, 'utf8'), keyPath)

  mkdirSync(dataDir, { recursive: true })
  const key = randomBytes(32)
  writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 })
  chmodSync(keyPath, 0o600)
  return key
}

const globalRef = globalThis as typeof globalThis & { __shukkaKey?: Buffer }
const encryptionKey = (globalRef.__shukkaKey ??= loadEncryptionKey())

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.')
}

export function decryptSecret(encoded: string): string {
  const [iv, tag, ciphertext] = encoded.split('.')
  if (!iv || !tag || !ciphertext) {
    throw new ShukkaError('storage_error', 'Stored S3 secret cannot be decrypted')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64'))
    decipher.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    throw new ShukkaError('storage_error', 'Stored S3 secret cannot be decrypted')
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export type PasswordHashScheme = 'scrypt' | 'pbkdf2'

/** New `pbkdf2$` hashes use this iteration count. Modest for a single admin and for later CF Free (~10ms). */
export const PBKDF2_ITERATIONS = 100_000

/** Verify rejects a stored iteration count above this to avoid a hung login from a hand-edited row. */
export const PBKDF2_MAX_ITERATIONS = 10_000_000

const PASSWORD_SALT_BYTES = 16
const SCRYPT_KEYLEN = 64
const PBKDF2_KEYLEN = 32
const PBKDF2_DIGEST = 'sha256'

export function passwordHashSchemeOf(stored: string): PasswordHashScheme {
  const scheme = stored.split('$', 1)[0]
  if (scheme === 'scrypt' || scheme === 'pbkdf2') return scheme
  throw new ShukkaError('invalid_request', 'Stored admin password hash uses an unknown scheme')
}

export function hashPassword(password: string, scheme: PasswordHashScheme): string {
  const salt = randomBytes(PASSWORD_SALT_BYTES)
  if (scheme === 'scrypt') {
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN)
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
  }
  const derived = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
  return `pbkdf2$${PBKDF2_ITERATIONS}$${salt.toString('hex')}$${derived.toString('hex')}`
}

function parseHex(value: string | undefined): Buffer | null {
  if (!value || value.length === 0 || value.length % 2 !== 0 || /[^0-9a-fA-F]/.test(value)) return null
  return Buffer.from(value, 'hex')
}

function equalDerived(derived: Buffer, expected: Buffer): boolean {
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  const [scheme, first, second, third] = parts
  if (scheme === 'scrypt') {
    const salt = parseHex(first)
    const expected = parseHex(second)
    if (parts.length !== 3 || !salt || !expected) return false
    try {
      return equalDerived(scryptSync(password, salt, expected.length), expected)
    } catch {
      return false
    }
  }
  if (scheme === 'pbkdf2') {
    const iterations = Number(first)
    const salt = parseHex(second)
    const expected = parseHex(third)
    if (
      parts.length !== 4 ||
      !Number.isInteger(iterations) ||
      iterations < 1 ||
      iterations > PBKDF2_MAX_ITERATIONS ||
      String(iterations) !== first ||
      !salt ||
      !expected
    ) {
      return false
    }
    try {
      return equalDerived(pbkdf2Sync(password, salt, iterations, expected.length, PBKDF2_DIGEST), expected)
    } catch {
      return false
    }
  }
  return false
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
