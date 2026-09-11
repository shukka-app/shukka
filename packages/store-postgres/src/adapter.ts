import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Store, StoreAdapter } from '@shukka/store'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { createPostgresStore } from './postgres-store.ts'
import * as schema from './schema.ts'

/** Session lock so overlapping `boot()` migrate calls cannot race `__drizzle_migrations`. */
const MIGRATE_LOCK_KEY = 859_001

function resolveMigrationsFolder(): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '../drizzle'),
    join(process.cwd(), 'drizzle-postgres'),
    join(process.cwd(), '../../packages/store-postgres/drizzle'),
    join(process.cwd(), 'packages/store-postgres/drizzle'),
  ]
  try {
    const pkg = fileURLToPath(import.meta.resolve('@shukka/store-postgres/package.json'))
    candidates.push(join(dirname(pkg), 'drizzle'))
  } catch {
    // Bundled entrypoints may not resolve the package.json export.
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta/_journal.json'))) return dir
  }
  throw new Error(
    'Postgres migrations folder not found (looked for packages/store-postgres/drizzle and ./drizzle-postgres)',
  )
}

async function boot(): Promise<Store> {
  const url = process.env.SHUKKA_DB_URL
  if (!url) {
    throw new Error('SHUKKA_DB_URL is required when SHUKKA_DB_DRIVER=postgres')
  }

  const folder = resolveMigrationsFolder()
  const migrateClient = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    await migrateClient`select pg_advisory_lock(${MIGRATE_LOCK_KEY})`
    try {
      await migrate(drizzle(migrateClient), { migrationsFolder: folder })
    } finally {
      await migrateClient`select pg_advisory_unlock(${MIGRATE_LOCK_KEY})`
    }
  } finally {
    await migrateClient.end({ timeout: 5 })
  }

  const client = postgres(url, { max: 10, onnotice: () => undefined })
  return createPostgresStore(drizzle(client, { schema }))
}

export const postgresAdapter: StoreAdapter = { boot }
