import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { dataDir } from '~/db/index.ts'
import { ShukkaError } from '~/lib/errors.ts'

/**
 * Encryption key for S3 secrets. Generated on first boot into the data directory,
 * so backing up `data/` captures everything needed to restore (ADR: per-app-s3-and-secrets).
 */
function loadEncryptionKey(): Buffer {
  const keyPath = process.env.SHUKKA_KEY_PATH ?? resolve(dataDir, 'encryption.key')
  if (existsSync(keyPath)) {
    const key = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'hex')
    if (key.length !== 32) {
      throw new Error(`Encryption key at ${keyPath} is not a 64-hex-char 256-bit key; refusing to start with a corrupt key`)
    }
    return key
  }
  mkdirSync(dirname(keyPath), { recursive: true })
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
