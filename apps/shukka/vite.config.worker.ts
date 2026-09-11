import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const gitSha = (() => {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
})()

export default defineConfig({
  define: { __GIT_SHA__: JSON.stringify(gitSha) },
  server: { port: 3000 },
  resolve: {
    tsconfigPaths: true,
    alias: {
      '@shukka/store-postgres': fileURLToPath(new URL('./src/lib/store-postgres-stub.ts', import.meta.url)),
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      importProtection: {
        server: { specifiers: ['recharts'] },
      },
    }),
    viteReact(),
  ],
})
