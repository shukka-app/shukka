import type { StoreAdapter } from '@shukka/store'

/** Worker-only stand-in so the Postgres client never enters the isolate graph. */
export const postgresAdapter: StoreAdapter = {
  boot() {
    return Promise.reject(new Error('SHUKKA_DB_DRIVER=postgres is not supported on Cloudflare Workers'))
  },
}
