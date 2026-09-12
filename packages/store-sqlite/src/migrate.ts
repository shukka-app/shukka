import { sql } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { bundledMigrations } from './migrations.bundle.ts'

const MIGRATIONS_TABLE = '__drizzle_migrations'

/** Same-process overlapping `boot()` shares one writer. Cross-process waits on SQLITE_BUSY. */
let migrateChain = Promise.resolve()

function migrationMeta() {
  return bundledMigrations.map((entry) => ({
    sql: entry.breakpoints ? entry.body.split('--> statement-breakpoint') : [entry.body],
    folderMillis: entry.when,
    hash: entry.hash,
  }))
}

/**
 * Apply bundled journal + SQL the same way `drizzle-orm/libsql/migrator` does,
 * without `node:fs`. Hash / `created_at` match drizzle-kit so existing
 * `__drizzle_migrations` rows stay valid.
 *
 * The whole apply runs in one libsql write transaction (`BEGIN IMMEDIATE` via
 * `client.transaction()`), so overlapping `boot()` calls serialize — file
 * SQLite and remote libsql both wait on the writer lock.
 */
export async function migrateFromBundle<TSchema extends Record<string, unknown>>(
  db: LibSQLDatabase<TSchema>,
): Promise<void> {
  const run = () => migrateLocked(db)
  const next = migrateChain.then(run, run)
  migrateChain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function migrateLocked<TSchema extends Record<string, unknown>>(
  db: LibSQLDatabase<TSchema>,
): Promise<void> {
  await db.run(sql`PRAGMA busy_timeout = 30000`)
  await db.transaction(async (tx) => {
    await tx.run(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(MIGRATIONS_TABLE)} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      )
    `)

    const dbMigrations = await tx.values<[number, string, string]>(
      sql`SELECT id, hash, created_at FROM ${sql.identifier(MIGRATIONS_TABLE)} ORDER BY created_at DESC LIMIT 1`,
    )
    const last = dbMigrations[0]

    for (const migration of migrationMeta()) {
      if (last && Number(last[2]) >= migration.folderMillis) continue
      for (const stmt of migration.sql) {
        await tx.run(sql.raw(stmt))
      }
      await tx.run(
        sql`INSERT INTO ${sql.identifier(MIGRATIONS_TABLE)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
      )
    }
  })
}
