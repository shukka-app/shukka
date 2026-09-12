import { resolve } from 'node:path'

/** Process data directory. Not a store concern — see docs/adr/store-port.md. */
export const dataDir = resolve(process.env.SHUKKA_DATA_DIR ?? './data')
