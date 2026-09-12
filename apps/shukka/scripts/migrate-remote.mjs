#!/usr/bin/env node
// Apply drizzle migrations to a remote libsql database (Turso, sqld, ...).
// Remote deployments (Workers, SCF) never auto-migrate at cold start —
// concurrent instances would race the migrator — so schema changes are
// applied out-of-band with this script:
//
//   SHUKKA_DB_URL=libsql://... SHUKKA_DB_AUTH_TOKEN=... node scripts/migrate-remote.mjs
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'

const url = process.env.SHUKKA_DB_URL
if (!url) {
  console.error('SHUKKA_DB_URL is required')
  process.exit(1)
}

const db = drizzle(createClient({ url, authToken: process.env.SHUKKA_DB_AUTH_TOKEN }))
await migrate(db, { migrationsFolder: './drizzle' })
console.log('migrations applied')
