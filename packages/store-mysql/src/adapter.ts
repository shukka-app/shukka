import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MIGRATE_LOCK_KEY, type Store, type StoreAdapter } from '@shukka/store'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import mysql from 'mysql2/promise'
import { createMysqlStore } from './mysql-store.ts'
import * as schema from './schema.ts'

function resolveMigrationsFolder(): string {
  const candidates = [
    join(dirname(fileURLToPath(import.meta.url)), '../drizzle'),
    join(process.cwd(), 'drizzle-mysql'),
    join(process.cwd(), '../../packages/store-mysql/drizzle'),
    join(process.cwd(), 'packages/store-mysql/drizzle'),
  ]
  try {
    const pkg = fileURLToPath(import.meta.resolve('@shukka/store-mysql/package.json'))
    candidates.push(join(dirname(pkg), 'drizzle'))
  } catch {
    // Bundled entrypoints may not resolve the package.json export.
  }
  for (const dir of candidates) {
    if (existsSync(join(dir, 'meta/_journal.json'))) return dir
  }
  throw new Error(
    'MySQL migrations folder not found (looked for packages/store-mysql/drizzle and ./drizzle-mysql)',
  )
}

async function lockResult(rows: unknown): Promise<number | null> {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const row = rows[0] as { acquired?: unknown }
  if (row.acquired == null) return null
  return Number(row.acquired)
}

async function boot(): Promise<Store> {
  const url = process.env.SHUKKA_DB_URL
  if (!url) {
    throw new Error('SHUKKA_DB_URL is required when SHUKKA_DB_DRIVER=mysql')
  }

  const folder = resolveMigrationsFolder()
  const migrateClient = await mysql.createConnection(url)
  try {
    const lockName = String(MIGRATE_LOCK_KEY)
    const [lockRows] = await migrateClient.query('SELECT GET_LOCK(?, -1) AS acquired', [lockName])
    if ((await lockResult(lockRows)) !== 1) {
      throw new Error('Failed to acquire MySQL migrate lock')
    }
    try {
      await migrate(drizzle(migrateClient, { mode: 'default' }), { migrationsFolder: folder })
    } finally {
      await migrateClient.query('SELECT RELEASE_LOCK(?) AS released', [lockName])
    }
  } finally {
    await migrateClient.end()
  }

  const pool = mysql.createPool({ uri: url, connectionLimit: 10 })
  return createMysqlStore(drizzle(pool, { schema, mode: 'default' }))
}

export const mysqlAdapter: StoreAdapter = { boot }
