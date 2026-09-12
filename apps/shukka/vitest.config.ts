import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  define: { __GIT_SHA__: JSON.stringify('test') },
  resolve: { alias: { '~': resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Each suite drives one shared in-process SQLite database.
    fileParallelism: false,
  },
})
