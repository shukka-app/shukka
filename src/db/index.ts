import { dirname, resolve } from 'node:path'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { isNodeRuntime } from '~/lib/runtime.ts'
import * as schema from './schema.ts'

export const dataDir = resolve(process.env.SHUKKA_DATA_DIR ?? './data')
const dbPath = process.env.SHUKKA_DB_PATH ?? resolve(dataDir, 'shukka.db')

export type Database = LibSQLDatabase<typeof schema>

async function createNodeDb(): Promise<Database> {
  const { mkdirSync, existsSync } = await import('node:fs')
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')

  mkdirSync(dirname(dbPath), { recursive: true })
  const client = createClient({ url: `file:${dbPath}` })
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA foreign_keys = ON')
  const database = drizzle(client, { schema })

  const migrationsFolder = resolve('./drizzle')
  if (existsSync(migrationsFolder)) {
    const { migrate } = await import('drizzle-orm/libsql/migrator')
    await migrate(database, { migrationsFolder })
  }
  return database
}

async function createWebDb(url: string): Promise<Database> {
  const { createClient } = await import('@libsql/client/web')
  const { drizzle } = await import('drizzle-orm/libsql')
  const client = createClient({ url, authToken: process.env.SHUKKA_DB_AUTH_TOKEN })
  return drizzle(client, { schema })
}

// Remote libsql over the Node client (e.g. SCF: Node runtime, ephemeral disk).
// No auto-migrate here — concurrent cold starts would race the migrator, so
// remote schema changes go through scripts/migrate-remote.mjs instead.
async function createRemoteNodeDb(url: string): Promise<Database> {
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const client = createClient({ url, authToken: process.env.SHUKKA_DB_AUTH_TOKEN })
  return drizzle(client, { schema })
}

async function createDb(): Promise<Database> {
  const url = process.env.SHUKKA_DB_URL
  if (url) return isNodeRuntime() ? createRemoteNodeDb(url) : createWebDb(url)
  if (isNodeRuntime()) return createNodeDb()
  throw new Error('SHUKKA_DB_URL is required when runtime is not Node')
}

// Vite dev server re-evaluates modules; keep one connection per process.
const globalRef = globalThis as typeof globalThis & { __shukkaDb?: Promise<Database> }
export const db: Database = await (globalRef.__shukkaDb ??= createDb())

export { schema }
