import type { Store } from '@shukka/store'

async function bootStore(): Promise<Store> {
  const { sqliteAdapter } = await import('@shukka/store-sqlite')
  return sqliteAdapter.boot()
}

// Vite dev server re-evaluates modules; keep one connection per process.
const globalRef = globalThis as typeof globalThis & { __shukkaStore?: Promise<Store> }
export const store: Store = await (globalRef.__shukkaStore ??= bootStore())
