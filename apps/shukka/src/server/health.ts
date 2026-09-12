import { store } from '~/lib/store.ts'

export type HealthStatus = 'ok' | 'degraded'
export type DbState = 'ok' | 'down'

export type HealthReport = {
  status: HealthStatus
  db: DbState
  httpStatus: number
}

/** Lightweight liveness probe: process up + store ping. Never throws. */
export async function checkHealth(): Promise<HealthReport> {
  try {
    await store.ping()
    return { status: 'ok', db: 'ok', httpStatus: 200 }
  } catch {
    return { status: 'degraded', db: 'down', httpStatus: 503 }
  }
}
