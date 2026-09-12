import type { StoreAdapter } from '@shukka/store'

/** Worker-only stand-in so the MySQL client never enters the isolate graph. */
export const mysqlAdapter: StoreAdapter = {
  boot() {
    return Promise.reject(new Error('SHUKKA_DB_DRIVER=mysql is not supported on Cloudflare Workers'))
  },
}
