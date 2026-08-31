import { and, eq, isNull, lt } from 'drizzle-orm'
import { db } from '~/db/index.ts'
import { admin, apiKeys, apps, sessions } from '~/db/schema.ts'
import {
  hashPassword,
  passwordHashSchemeOf,
  randomToken,
  sha256,
  verifyPassword,
  type PasswordHashScheme,
} from './crypto.ts'
import { ShukkaError, safeDecodeURIComponent } from './errors.ts'
import type { App } from '~/db/schema.ts'

export const SESSION_COOKIE = 'shukka_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14

const nowSeconds = () => Math.floor(Date.now() / 1000)

export async function isInitialized(): Promise<boolean> {
  const [row] = await db.select({ id: admin.id }).from(admin).limit(1)
  return row !== undefined
}

/** Consulted only by first setup. Later env flips are ignored. */
function setupPasswordHashScheme(): PasswordHashScheme {
  if (process.env.SHUKKA_PASSWORD_HASH === undefined) return 'scrypt'
  const value = process.env.SHUKKA_PASSWORD_HASH.trim()
  if (value === 'scrypt') return 'scrypt'
  if (value === 'pbkdf2') return 'pbkdf2'
  throw new ShukkaError('invalid_request', 'SHUKKA_PASSWORD_HASH must be "scrypt" or "pbkdf2"')
}

export async function initializeAdmin(password: string): Promise<string> {
  if (await isInitialized()) throw new ShukkaError('conflict', 'Shukka is already initialized')
  assertPasswordStrength(password)
  await db.insert(admin).values({ id: 1, passwordHash: hashPassword(password, setupPasswordHashScheme()) })
  return createSession()
}

export async function login(password: string): Promise<string> {
  const [row] = await db.select().from(admin).limit(1)
  if (!row || !verifyPassword(password, row.passwordHash)) {
    throw new ShukkaError('unauthorized', 'Incorrect password')
  }
  return createSession()
}

/** Changing the password invalidates every existing session (ADR: auth-model). */
export async function changePassword(currentPassword: string, newPassword: string): Promise<string> {
  const [row] = await db.select().from(admin).limit(1)
  if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
    throw new ShukkaError('unauthorized', 'Incorrect current password')
  }
  assertPasswordStrength(newPassword)
  await db.transaction(async (tx) => {
    await tx
      .update(admin)
      .set({ passwordHash: hashPassword(newPassword, passwordHashSchemeOf(row.passwordHash)), updatedAt: nowSeconds() })
    await tx.delete(sessions)
  })
  return createSession()
}

function assertPasswordStrength(password: string): void {
  if (password.length < 8) {
    throw new ShukkaError('invalid_request', 'Password must be at least 8 characters')
  }
}

export async function createSession(): Promise<string> {
  const token = randomToken()
  await db.delete(sessions).where(lt(sessions.expiresAt, nowSeconds()))
  await db.insert(sessions).values({ tokenHash: sha256(token), expiresAt: nowSeconds() + SESSION_TTL_SECONDS })
  return token
}

export async function destroySession(token: string | null): Promise<void> {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)))
}

export async function sessionIsValid(token: string | null): Promise<boolean> {
  if (!token) return false
  const [row] = await db.select().from(sessions).where(eq(sessions.tokenHash, sha256(token))).limit(1)
  return Boolean(row && row.expiresAt > nowSeconds())
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return safeDecodeURIComponent(rest.join('='))
  }
  return null
}

export type CookieSecureSource = Request | { secure?: boolean }

export function cookieShouldBeSecure(source: CookieSecureSource): boolean {
  const flag = process.env.SHUKKA_SECURE_COOKIES
  if (flag === '1' || flag === 'true') return true
  if (source instanceof Request) {
    if (new URL(source.url).protocol === 'https:') return true
    const proto = source.headers.get('x-forwarded-proto')?.split(',')[0]?.trim()
    return proto === 'https'
  }
  return source.secure === true
}

function sessionCookieFlags(source: CookieSecureSource, maxAge: number): string {
  const secure = cookieShouldBeSecure(source) ? '; Secure' : ''
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}

export function sessionCookieHeader(
  token: string,
  source: CookieSecureSource = {},
  maxAge = SESSION_TTL_SECONDS,
): string {
  return `${SESSION_COOKIE}=${token}; ${sessionCookieFlags(source, maxAge)}`
}

export function clearSessionCookieHeader(source: CookieSecureSource = {}): string {
  return `${SESSION_COOKIE}=; ${sessionCookieFlags(source, 0)}`
}

/** Throws unless the request carries a valid admin session. */
export async function requireAdmin(request: Request): Promise<void> {
  if (!(await sessionIsValid(readSessionCookie(request)))) {
    throw new ShukkaError('unauthorized', 'Admin session required')
  }
}

export const API_KEY_PREFIX = 'shk_'

export function generateApiKey(): { plaintext: string; hash: string; hint: string } {
  const plaintext = `${API_KEY_PREFIX}${randomToken(24)}`
  return { plaintext, hash: sha256(plaintext), hint: `${plaintext.slice(0, 10)}…` }
}

/** Resolves the app an upload request is authorized for; 401 unknown/revoked, 403 wrong app. */
export async function authenticateApiKey(request: Request, appSlug?: string): Promise<App> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new ShukkaError('unauthorized', 'Missing Bearer API key')

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.hash, sha256(token)), isNull(apiKeys.revokedAt)))
    .limit(1)
  if (!key) throw new ShukkaError('unauthorized', 'Invalid or revoked API key')

  const [app] = await db.select().from(apps).where(eq(apps.id, key.appId)).limit(1)
  if (!app) throw new ShukkaError('unauthorized', 'API key references a deleted app')
  if (appSlug && app.slug !== appSlug) {
    throw new ShukkaError('forbidden', `API key is not authorized for app "${appSlug}"`)
  }

  await db.update(apiKeys).set({ lastUsedAt: nowSeconds() }).where(eq(apiKeys.id, key.id))
  return app
}

export type AppActor = { app: App; via: 'session' | 'key' }

/**
 * App-scoped actor: Bearer key if `Authorization` is present, otherwise the
 * admin session. The key must be bound to `slug`.
 */
async function appBySlug(slug: string): Promise<App> {
  const [app] = await db.select().from(apps).where(eq(apps.slug, slug)).limit(1)
  if (!app) throw new ShukkaError('not_found', `App "${slug}" not found`)
  return app
}

export async function requireAppActor(request: Request, slug: string): Promise<AppActor> {
  if (request.headers.get('authorization')) {
    return { app: await authenticateApiKey(request, slug), via: 'key' }
  }
  await requireAdmin(request)
  return { app: await appBySlug(slug), via: 'session' }
}

/** Session-only app ops (delete app, API key CRUD). Keys are rejected even if valid. */
export async function requireSessionApp(request: Request, slug: string): Promise<App> {
  if (request.headers.get('authorization')) {
    throw new ShukkaError('forbidden', 'This operation requires an admin session')
  }
  await requireAdmin(request)
  return appBySlug(slug)
}
