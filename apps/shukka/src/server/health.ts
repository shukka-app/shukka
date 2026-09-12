import { sql } from 'drizzle-orm'
import { db } from '~/db/index.ts'

export type HealthStatus = 'ok' | 'degraded'
export type DbState = 'ok' | 'down'

export type HealthReport = {
  status: HealthStatus
  db: DbState
  httpStatus: number
}

/** Lightweight liveness probe: process up + SQLite `SELECT 1`. Never throws. */
export async function checkHealth(): Promise<HealthReport> {
  try {
    await db.run(sql`SELECT 1`)
    return { status: 'ok', db: 'ok', httpStatus: 200 }
  } catch {
    return { status: 'degraded', db: 'down', httpStatus: 503 }
  }
}
