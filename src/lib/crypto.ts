import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dataDir } from '~/db/index.ts'
import { ShukkaError } from '~/lib/errors.ts'

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

export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !expected) return false
  const derived = scryptSync(password, Buffer.from(salt, 'hex'), 64)
  const expectedBuf = Buffer.from(expected, 'hex')
  return derived.length === expectedBuf.length && timingSafeEqual(derived, expectedBuf)
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}
