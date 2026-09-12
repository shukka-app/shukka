import { runtime } from 'std-env'
import type { Store } from '@shukka/store'

async function bootStore(): Promise<Store> {
  const driver = process.env.SHUKKA_DB_DRIVER ?? 'sqlite'
  if (driver === 'postgres') {
    if (runtime !== 'node') {
      throw new Error('SHUKKA_DB_DRIVER=postgres is not supported on Cloudflare Workers')
    }
    const { postgresAdapter } = await import('@shukka/store-postgres')
    return postgresAdapter.boot()
  }
  if (driver !== 'sqlite') {
    throw new Error(`Unknown SHUKKA_DB_DRIVER: ${driver}`)
  }
  const { sqliteAdapter } = await import('@shukka/store-sqlite')
  return sqliteAdapter.boot()
}

// Vite dev server re-evaluates modules; keep one connection per process.
const globalRef = globalThis as typeof globalThis & { __shukkaStore?: Promise<Store> }
export const store: Store = await (globalRef.__shukkaStore ??= bootStore())
