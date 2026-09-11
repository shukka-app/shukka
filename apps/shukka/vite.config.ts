import { execSync } from 'node:child_process'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import tailwindcss from '@tailwindcss/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'
import { SECURITY_HEADERS } from './src/lib/security-headers.ts'

/**
 * Commit the running build was cut from — the panel pins agent-skill installs
 * to it. Builds without git metadata (e.g. a source tarball) fall back to
 * 'dev', which callers treat as "unpinned".
 */
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
  resolve: { tsconfigPaths: true },
  // store-sqlite is workspace TS, so Vite compiles it into the app graph.
  // Bundling @libsql/client with it drops the `libsql` native optional packages
  // from nf3's trace. Keep them as runtime imports; Nitro copies the packages
  // into .output (they are hoisted so the tracer can resolve them).
  ssr: {
    external: ['@libsql/client', 'libsql'],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        server: { specifiers: ['recharts'] },
      },
    }),
    viteReact(),
    nitro({
      traceDeps: ['@libsql/client*', 'libsql*'],
      routeRules: {
        '/**': {
          headers: { ...SECURITY_HEADERS },
        },
      },
    }),
  ],
})
