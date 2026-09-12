import { runtime } from 'std-env'
import type { Store, StoreAdapter } from '@shukka/store'
import { migrateFromBundle } from './migrate.ts'
import * as schema from './schema.ts'
import { createSqliteStore } from './sqlite-store.ts'

function isNodeRuntime(): boolean {
  return runtime === 'node'
}

async function connect() {
  const url = process.env.SHUKKA_DB_URL
  if (url) {
    if (isNodeRuntime()) {
      const { createClient } = await import('@libsql/client')
      const { drizzle } = await import('drizzle-orm/libsql')
      return drizzle(createClient({ url, authToken: process.env.SHUKKA_DB_AUTH_TOKEN }), { schema })
    }
    const { createClient } = await import('@libsql/client/web')
    const { drizzle } = await import('drizzle-orm/libsql')
    return drizzle(createClient({ url, authToken: process.env.SHUKKA_DB_AUTH_TOKEN }), { schema })
  }
  if (!isNodeRuntime()) {
    throw new Error('SHUKKA_DB_URL is required when runtime is not Node')
  }

  const { dirname, resolve } = await import('node:path')
  const { mkdirSync } = await import('node:fs')
  const { createClient } = await import('@libsql/client')
  const { drizzle } = await import('drizzle-orm/libsql')
  const dataDir = resolve(process.env.SHUKKA_DATA_DIR ?? './data')
  const dbPath = process.env.SHUKKA_DB_PATH ?? resolve(dataDir, 'shukka.db')
  mkdirSync(dirname(dbPath), { recursive: true })
  const client = createClient({ url: `file:${dbPath}` })
  await client.execute('PRAGMA busy_timeout = 30000')
  await client.execute('PRAGMA journal_mode = WAL')
  await client.execute('PRAGMA foreign_keys = ON')
  return drizzle(client, { schema })
}

async function boot(): Promise<Store> {
  const db = await connect()
  await migrateFromBundle(db)
  return createSqliteStore(db)
}

export const sqliteAdapter: StoreAdapter = { boot }
