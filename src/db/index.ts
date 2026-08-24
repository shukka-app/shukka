import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema.ts'

export const dataDir = resolve(process.env.SHUKKA_DATA_DIR ?? './data')
const dbPath = process.env.SHUKKA_DB_PATH ?? resolve(dataDir, 'shukka.db')

function createDb() {
  mkdirSync(dirname(dbPath), { recursive: true })
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  const database = drizzle(sqlite, { schema })

  const migrationsFolder = resolve('./drizzle')
  if (existsSync(migrationsFolder)) {
    migrate(database, { migrationsFolder })
  }
  return database
}

// Vite dev server re-evaluates modules; keep one connection per process.
const globalRef = globalThis as typeof globalThis & { __shukkaDb?: ReturnType<typeof createDb> }
export const db = (globalRef.__shukkaDb ??= createDb())

export { schema }
